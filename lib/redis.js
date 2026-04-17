/**
 * BEN AMI SHOP — lib/redis.js  (Step 1 of architecture migration)
 *
 * PURPOSE (Step 1 — scaffolding only):
 *   - Create a single ioredis client on boot when REDIS_URL is set.
 *   - Expose connection status for /api/health and boot logs.
 *   - NEVER crash the app if Redis is missing, misconfigured, or down.
 *
 * OUT OF SCOPE for this step (added in later steps):
 *   - Pub/Sub (Step 3 — will open a second, dedicated subscriber connection).
 *   - Rate-limit counters (Step 2).
 *   - JWT revocation store (Step 2).
 *   - Any command helpers (SET/GET/INCR/...) — will be added when features
 *     that consume them land. For now no call site exists.
 *
 * DESIGN NOTES:
 *   - ioredis is chosen over node-redis because (a) it requires a separate
 *     connection for SUBSCRIBE, which matches the pub/sub architecture we
 *     are migrating toward, and (b) its retryStrategy is easier to cap
 *     than node-redis's defaults, which is important on Render's free tier
 *     where Redis can be absent entirely in dev.
 *   - enableOfflineQueue=false means commands issued while disconnected
 *     fail fast instead of buffering silently. In Step 1 nothing issues
 *     commands anyway; setting it now prevents surprise pile-ups later.
 *   - maxRetriesPerRequest is kept low (3) for the same reason: no hot
 *     path should hang waiting for a dead Redis.
 *   - Status is reported as one of:
 *       'disabled'      REDIS_URL not set — Redis is optional in dev
 *       'connecting'    client created, first connection in progress
 *       'ready'         connected + authenticated + READY
 *       'reconnecting'  transient disconnect, ioredis is retrying
 *       'error'         last observed state was an error event
 *       'end'           client was explicitly shut down
 *     Consumers (currently only /api/health) should treat anything other
 *     than 'ready' and 'disabled' as "not yet usable."
 */

'use strict';

var Redis = null;            // ioredis module (lazy-required so a missing
                             // npm install doesn't crash the server on boot)
var client = null;           // the one shared ioredis client
var status = 'disabled';     // see comment above for allowed values
var lastError = null;        // most recent error message, surfaced in /api/health
var initCalled = false;      // idempotency guard — init() must be a no-op on 2nd call

/* ── Lazy require of ioredis ───────────────────────────────────────
   If `npm install ioredis` hasn't been run yet, requiring it at the
   top of server.js would crash boot. Deferring the require to init()
   means a misinstalled deployment logs a clear warning and keeps
   running with Redis disabled, matching the Step-1 acceptance criteria:
   "App still works even if Redis is unused."
────────────────────────────────────────────────────────────────── */
function _loadIoredis() {
  if (Redis) return true;
  try {
    Redis = require('ioredis');
    return true;
  } catch (e) {
    console.warn('[REDIS] ⚠️ Module ioredis introuvable — exécutez `npm install` : ' + e.message);
    return false;
  }
}

/* ── init() — called once from server.js during startup ────────────
   Non-blocking: returns immediately. The TCP handshake and AUTH
   happen asynchronously; the 'ready' event flips status to 'ready'.
   Callers should never `await` this — the server must come up
   whether Redis is reachable or not.
────────────────────────────────────────────────────────────────── */
function init() {
  if (initCalled) return;
  initCalled = true;

  var url = String(process.env.REDIS_URL || '').trim();
  if (!url) {
    status = 'disabled';
    console.log('[REDIS] ℹ️  REDIS_URL non défini — Redis désactivé (OK pour le dev local)');
    return;
  }

  if (!_loadIoredis()) {
    status = 'error';
    lastError = 'ioredis module not installed';
    return;
  }

  // Hide credentials when logging the target host
  var safeUrl;
  try {
    var u = new URL(url);
    safeUrl = (u.protocol || 'redis:') + '//' + (u.hostname || '') + (u.port ? ':' + u.port : '');
  } catch (e) {
    safeUrl = '[invalid URL]';
  }
  console.log('[REDIS] 🔧 Initialisation — cible: ' + safeUrl);

  try {
    client = new Redis(url, {
      // lazyConnect=false (default): connect on construction. We want the
      // connection attempt to start immediately so /api/health reflects
      // real state from the first request onward.
      lazyConnect: false,

      // connectTimeout: don't hang indefinitely on a bad URL / unreachable host.
      connectTimeout: 10000,

      // maxRetriesPerRequest: commands fail fast rather than piling up.
      // Step 1 issues no commands; this matters for Step 2+.
      maxRetriesPerRequest: 3,

      // enableOfflineQueue=false: issuing commands while disconnected
      // rejects immediately instead of buffering. Predictable behavior
      // for the rate-limit and revocation paths added in Step 2.
      enableOfflineQueue: false,

      // Exponential backoff capped at 30s. ioredis calls this on every
      // reconnect attempt; returning a number = delay in ms before retry,
      // returning null/false = stop retrying (we never do).
      retryStrategy: function (times) {
        var delay = Math.min(100 * Math.pow(2, times - 1), 30000);
        return delay;
      },

      // reconnectOnError: transient READONLY / failover errors should
      // trigger a reconnect, not surface to callers. Return true to
      // reconnect, 'reconnect' to also re-queue the failed command.
      reconnectOnError: function (err) {
        var msg = (err && err.message) || '';
        if (msg.indexOf('READONLY') !== -1) return true;
        return false;
      },
    });
  } catch (e) {
    status = 'error';
    lastError = e.message;
    console.error('[REDIS] ❌ Impossible de créer le client: ' + e.message);
    client = null;
    return;
  }

  status = 'connecting';

  // ── Event wiring ────────────────────────────────────────────────
  // ioredis emits these in roughly this order on a healthy start:
  //   connect  → TCP established
  //   ready    → AUTH done, SELECT done, client fully usable
  // On transient failures:
  //   error → close → reconnecting → connect → ready
  // On deliberate shutdown (our quit()):
  //   end (terminal)

  client.on('connect', function () {
    console.log('[REDIS] 🔌 Connexion TCP établie');
  });

  client.on('ready', function () {
    status = 'ready';
    lastError = null;
    console.log('[REDIS] ✅ Client prêt (connecté + authentifié)');
  });

  client.on('error', function (err) {
    lastError = (err && err.message) || String(err);
    // Only log once per transition to avoid spamming the console when
    // Redis is down and ioredis retries every 30s.
    if (status !== 'error') {
      console.warn('[REDIS] ⚠️  Erreur: ' + lastError);
    }
    status = 'error';
  });

  client.on('close', function () {
    // 'close' fires before 'reconnecting' on transient failures and before
    // 'end' on deliberate shutdown. We don't mutate status here — the
    // following 'reconnecting' or 'end' event will set it correctly.
  });

  client.on('reconnecting', function (delay) {
    status = 'reconnecting';
    console.log('[REDIS] 🔄 Reconnexion dans ' + delay + 'ms');
  });

  client.on('end', function () {
    status = 'end';
    console.log('[REDIS] 🛑 Connexion fermée définitivement');
  });
}

/* ── Accessors ─────────────────────────────────────────────────────
   Exposed so that future Step 2+ modules can reach into the shared
   client without re-creating one. /api/health uses getStatus() and
   getLastError() to build its payload.
────────────────────────────────────────────────────────────────── */
function getClient() { return client; }
function getStatus() { return status; }
function isReady()   { return status === 'ready'; }
function isEnabled() { return status !== 'disabled'; }
function getLastError() { return lastError; }

/* ── ping() — lightweight liveness probe ───────────────────────────
   Returns 'PONG' on success, null on any failure (disabled, not ready,
   or command error). Used by /api/health to confirm the connection
   isn't just reporting 'ready' from a stale event listener.
   Has a 2s timeout so /api/health can't hang if Redis is wedged.
────────────────────────────────────────────────────────────────── */
async function ping() {
  if (!client || status !== 'ready') return null;
  try {
    var p = client.ping();
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('ping timeout')); }, 2000);
    });
    var r = await Promise.race([p, timeout]);
    return r;
  } catch (e) {
    lastError = e.message;
    return null;
  }
}

/* ── shutdown() — graceful close during SIGTERM ────────────────────
   Called from server.js's shutdown handler. QUIT sends the QUIT
   command to Redis and waits for the server's goodbye, which is
   cleaner than disconnect() (hard socket close). If QUIT hangs we
   fall back to disconnect() after 3s so the process can exit.
────────────────────────────────────────────────────────────────── */
async function shutdown() {
  if (!client) return;
  try {
    var quitP = client.quit();
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve('timeout'); }, 3000);
    });
    var result = await Promise.race([quitP, timeout]);
    if (result === 'timeout') {
      console.warn('[REDIS] ⏱  QUIT timeout — forçage disconnect()');
      try { client.disconnect(); } catch (e) {}
    }
  } catch (e) {
    try { client.disconnect(); } catch (e2) {}
  }
  client = null;
}

module.exports = {
  init: init,
  getClient: getClient,
  getStatus: getStatus,
  isReady: isReady,
  isEnabled: isEnabled,
  getLastError: getLastError,
  ping: ping,
  shutdown: shutdown,
};

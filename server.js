/**
 * BEN AMI SHOP — server.js  v9 (Step 2 — Transactions atomiques)
 *
 * Migration SQLite → PostgreSQL + Redis scaffolding + Transactions
 */

'use strict';

var http   = require('http');
var fs     = require('fs');
var path   = require('path');
var crypto = require('crypto');
var bcrypt = require('bcryptjs');
var jwt    = require('jsonwebtoken');
var { Pool } = require('pg');

/* ── Step 1: Redis + Step 2: Transactions ──────────────────── */
var redis = require('./lib/redis');
var { withTransaction } = require('./lib/tx');

/* ── Configuration ──────────────────────────────────────────── */
try {
  var envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(function(line) {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      var eq = line.indexOf('=');
      if (eq < 0) return;
      var k = line.slice(0, eq).trim();
      var v = line.slice(eq + 1).trim();
      if (k && !process.env[k]) process.env[k] = v;
    });
    console.log('[CONFIG] .env chargé');
  }
} catch(e) { console.warn('[CONFIG] .env non chargé:', e.message); }

var PORT     = parseInt(process.env.PORT, 10) || 3000;
var HOST     = process.env.HOST      || '0.0.0.0';
var NODE_ENV = process.env.NODE_ENV  || 'development';
var IS_PROD  = NODE_ENV === 'production';
var CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
var JWT_SECRET = (process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('[FATAL] JWT_SECRET manquant ou trop court.');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('[FATAL] DATABASE_URL non défini');
  process.exit(1);
}

console.log('[CONFIG] ENV=' + NODE_ENV + ' PORT=' + PORT);

/* ── Database Pool ─────────────────────────────────────────── */
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: IS_PROD ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => console.error('[DB] Pool error:', err.message));

/* ── Helpers DB ────────────────────────────────────────────── */
async function Q(sql, p) {
  var r = await pool.query(sql, p || []);
  return r.rows;
}
async function R(sql, p) {
  await pool.query(sql, p || []);
}
async function INSERT(sql, p) {
  var r = await pool.query(sql, p || []);
  return r.rows[0].id;
}

/* ── HTTP Helpers ─────────────────────────────────────────── */
function jsonRes(res, data, code) {
  var h = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
  res.writeHead(code || 200, h);
  res.end(JSON.stringify(data));
}

function clean(s) { return typeof s === 'string' ? s.trim().slice(0, 1000) : ''; }

function readBody(req) {
  return new Promise(function(ok) {
    var s = '';
    req.on('data', c => s += c);
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch(e) { ok({}); } });
    req.on('error', () => ok({}));
  });
}

async function readBodySafe(req, res) {
  var body = await readBody(req);
  return body;
}

/* ── Auth ─────────────────────────────────────────────────── */
async function getPayload(req) {
  var h = req.headers['authorization'] || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    var p = jwt.verify(h.slice(7), JWT_SECRET);
    var r = await Q('SELECT is_active FROM users WHERE id=$1', [p.id]);
    if (!r.length || !r[0].is_active) return null;
    return p;
  } catch(e) { return null; }
}

async function needAdmin(req, res) {
  var p = await getPayload(req);
  if (!p) { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (p.role !== 'admin') { jsonRes(res, { error: 'Accès réservé aux administrateurs.' }, 403); return null; }
  return p;
}

async function needEmployee(req, res) {
  var p = await getPayload(req);
  if (!p) { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (!['admin','employee'].includes(p.role)) { jsonRes(res, { error: 'Accès interdit.' }, 403); return null; }
  return p;
}

/* ── SSE (Server-Sent Events) ─────────────────────────────── */
var sseClients = new Set();
function broadcast(type, payload) {
  if (sseClients.size === 0) return;
  var msg = 'data: ' + JSON.stringify(Object.assign({ type: type, ts: Date.now() }, payload || {})) + '\n\n';
  sseClients.forEach(c => { try { c.res.write(msg); } catch(e) {} });
}

/* ── Logger ───────────────────────────────────────────────── */
async function log(user, action, target) {
  try {
    await pool.query('INSERT INTO activity_logs (user_id,user_name,role,action,target) VALUES ($1,$2,$3,$4,$5)',
      [user ? user.id : 0, user ? user.email : 'system', user ? user.role : 'system', action, target || '']);
  } catch(e) {}
}

/* ── Schéma & Seed ───────────────────────────────────────── */
async function initDB() {
  // Tables
  await pool.query(`CREATE TABLE IF NOT EXISTS brands (id SERIAL PRIMARY KEY, name TEXT UNIQUE, country TEXT DEFAULT '')`);
  await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT, sku TEXT UNIQUE, brand TEXT, price NUMERIC, qty INTEGER DEFAULT 0, color TEXT, description TEXT, img TEXT, sizes TEXT DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS product_sizes (id SERIAL PRIMARY KEY, product_id INTEGER, size INTEGER, qty INTEGER DEFAULT 0, UNIQUE(product_id, size))`);
  await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'employee', is_active INTEGER DEFAULT 1)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS stock_movements (id SERIAL PRIMARY KEY, product_id INTEGER, product_name TEXT, brand TEXT, size INTEGER, type TEXT, quantity INTEGER, note TEXT, moved_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS activity_logs (id SERIAL PRIMARY KEY, user_id INTEGER, user_name TEXT, role TEXT, action TEXT, target TEXT, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
  
  // Admin par défaut
  var uc = await Q('SELECT COUNT(*) AS c FROM users');
  if (+uc[0].c === 0) {
    var hash = await bcrypt.hash('admin123', 12);
    await pool.query('INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,$3,$4,1)', ['Admin', 'admin@benami.shop', hash, 'admin']);
    console.log('[DB] Admin créé: admin@benami.shop / admin123');
  }
  console.log('[DB] ✅ Connexion OK');
}

/* ════════════════════════════════════════════════════════════
   ROUTEUR PRINCIPAL (avec Transactions Step 2)
════════════════════════════════════════════════════════════ */

async function handleRequest(req, res) {
  var url = new URL(req.url, 'http://localhost:' + PORT);
  var method = req.method.toUpperCase();
  var pathname = url.pathname;

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /* ── Health Check ───────────────────────────────────────── */
  if (pathname === '/api/health' && method === 'GET') {
    var dbOk = false;
    try {
      var rows = await Q('SELECT 1 AS ok');
      dbOk = rows[0].ok === 1;
    } catch(e) {}
    var redisStatus = redis.getStatus ? redis.getStatus() : 'unknown';
    return jsonRes(res, {
      ok: dbOk,
      server: 'ok',
      version: 'v9',
      db: { ok: dbOk },
      redis: { status: redisStatus },
      ts: Date.now()
    }, dbOk ? 200 : 503);
  }

  /* ── Static Files ────────────────────────────────────────── */
  if (!pathname.startsWith('/api/')) {
    var fp = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    var ext = path.extname(fp);
    var type = {'.html':'text/html','.js':'application/javascript','.css':'text/css'}[ext] || 'text/plain';
    res.writeHead(200, {'Content-Type': type});
    fs.createReadStream(fp).pipe(res);
    return;
  }

  /* ── Auth Routes ─────────────────────────────────────────── */
  
  // Login
  if (pathname === '/api/login' && method === 'POST') {
    var body = await readBodySafe(req, res);
    var em = clean(body.email).toLowerCase();
    var pw = body.password || '';
    var users = await Q('SELECT * FROM users WHERE email=$1', [em]);
    if (!users.length) return jsonRes(res, { error: 'Identifiants incorrects.' }, 401);
    var u = users[0];
    var ok = await bcrypt.compare(pw, u.password);
    if (!ok) return jsonRes(res, { error: 'Identifiants incorrects.' }, 401);
    if (!u.is_active) return jsonRes(res, { error: 'Compte désactivé.' }, 403);
    var token = jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
    return jsonRes(res, { token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }

  // Register
  if (pathname === '/api/register' && method === 'POST') {
    var body = await readBodySafe(req, res);
    var hash = await bcrypt.hash(body.password, 12);
    try {
      var id = await INSERT('INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,$3,$4,1) RETURNING id', [body.name, body.email.toLowerCase(), hash, body.role || 'employee']);
      return jsonRes(res, { id }, 201);
    } catch(e) {
      return jsonRes(res, { error: 'Email déjà utilisé.' }, 409);
    }
  }

  /* ── PRODUCTS ────────────────────────────────────────────── */
  
  if (pathname === '/api/products') {
    
    // GET /api/products
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      var rows = await Q('SELECT * FROM products ORDER BY id DESC');
      return jsonRes(res, rows.map(p => Object.assign({}, p, { sizes: JSON.parse(p.sizes || '[]') })));
    }

    // POST /api/products ✅ TRANSACTION
    if (method === 'POST') {
      var caller = await needAdmin(req, res); 
      if (!caller) return;
      var body = await readBodySafe(req, res);
      
      var pname = clean(body.name), psku = clean(body.sku), pbrand = clean(body.brand);
      var pprice = Number(body.price), pqty = Number(body.qty || body.stock);
      var psizes = (body.sizes || []).map(Number).filter(v => v > 0);
      
      if (!pname || !psku || !pbrand) return jsonRes(res, { error: 'Champs requis manquants.' }, 400);

      try {
        // ✅ TRANSACTION: Produit + Tailles atomiques
        var newId = await withTransaction(async (client) => {
          var r = await client.query(
            'INSERT INTO products (name,sku,brand,price,qty,color,description,img,sizes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [pname, psku, pbrand, pprice, pqty, clean(body.color), clean(body.description), body.img || '👟', JSON.stringify(psizes)]
          );
          var id = r.rows[0].id;
          
          var base = psizes.length && pqty > 0 ? Math.floor(pqty / psizes.length) : 0;
          for (var s of psizes) {
            await client.query('INSERT INTO product_sizes (product_id,size,qty) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, s, base]);
          }
          return id;
        });

        // Log mouvement (hors transaction)
        if (pqty > 0) {
          await R('INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6)',
            [newId, pname, pbrand, 'in', pqty, 'Stock initial']);
        }
        
        log(caller, 'ADD_PRODUCT', pname);
        broadcast('product_updated', { id: newId, action: 'create' });
        return jsonRes(res, { id: newId }, 201);
        
      } catch(e) {
        return jsonRes(res, { error: e.message }, 409);
      }
    }
  }

  // PUT /api/products/:id ✅ TRANSACTION
  var mP = pathname.match(/^\/api\/products\/(\d+)$/);
  if (mP) {
    var pid = +mP[1];
    
    if (method === 'PUT') {
      var caller = await needAdmin(req, res);
      if (!caller) return;
      var body = await readBodySafe(req, res);
      var olds = await Q('SELECT * FROM products WHERE id=$1', [pid]);
      if (!olds.length) return jsonRes(res, { error: 'Introuvable.' }, 404);
      var o = olds[0];

      try {
        // ✅ TRANSACTION: Update produit + tailles + recalcul
        await withTransaction(async (client) => {
          // Update produit
          var uN = body.name ? clean(body.name) : o.name;
          var uS = body.sku ? clean(body.sku) : o.sku;
          var uB = body.brand ? clean(body.brand) : o.brand;
          var uP = body.price !== undefined ? Number(body.price) : o.price;
          var uQ = body.qty !== undefined ? Number(body.qty) : o.qty;
          
          await client.query(
            'UPDATE products SET name=$1,sku=$2,brand=$3,price=$4,qty=$5,color=$6,description=$7,img=$8,sizes=$9,updated_at=CURRENT_TIMESTAMP WHERE id=$10',
            [uN, uS, uB, uP, uQ, clean(body.color || o.color), clean(body.description || o.description), body.img || o.img, JSON.stringify(body.sizes || JSON.parse(o.sizes)), pid]
          );

          // Update tailles si fourni
          if (Array.isArray(body.sizesData)) {
            await client.query('DELETE FROM product_sizes WHERE product_id=$1', [pid]);
            for (var sd of body.sizesData) {
              await client.query('INSERT INTO product_sizes (product_id,size,qty) VALUES ($1,$2,$3)', [pid, sd.size, sd.qty || 0]);
            }
          }
          
          // Recalcul automatique du total à partir des tailles
          if (Array.isArray(body.sizesData)) {
            var tot = await client.query('SELECT COALESCE(SUM(qty),0) AS t FROM product_sizes WHERE product_id=$1', [pid]);
            await client.query('UPDATE products SET qty=$1 WHERE id=$2', [tot.rows[0].t, pid]);
          }
        });

        // Mouvement stock si changement de quantité (hors transaction)
        var newQty = body.qty !== undefined ? Number(body.qty) : o.qty;
        if (newQty !== +o.qty) {
          var diff = newQty - +o.qty;
          await R('INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6)',
            [pid, o.name, o.brand, diff > 0 ? 'in' : 'out', Math.abs(diff), 'Ajustement stock']);
        }

        broadcast('product_updated', { id: pid, action: 'update' });
        return jsonRes(res, { success: true });
        
      } catch(e) {
        return jsonRes(res, { error: e.message }, 500);
      }
    }

    if (method === 'DELETE') {
      var caller = await needAdmin(req, res);
      if (!caller) return;
      // Pas besoin de transaction pour DELETE simple, mais on wrap quand même pour cohérence
      try {
        await withTransaction(async (client) => {
          await client.query('DELETE FROM product_sizes WHERE product_id=$1', [pid]);
          await client.query('DELETE FROM products WHERE id=$1', [pid]);
        });
        broadcast('product_updated', { id: pid, action: 'delete' });
        return jsonRes(res, { success: true });
      } catch(e) {
        return jsonRes(res, { error: e.message }, 500);
      }
    }
  }

  /* ── SIZES ─────────────────────────────────────────────────── */
  
  // GET /api/sizes/:id
  var mSz = pathname.match(/^\/api\/sizes\/(\d+)$/);
  if (mSz && method === 'GET') {
    if (!await needEmployee(req, res)) return;
    return jsonRes(res, await Q('SELECT size,qty FROM product_sizes WHERE product_id=$1 ORDER BY size', [+mSz[1]]));
  }

  // POST /api/sizes/adjust ✅ TRANSACTION
  if (pathname === '/api/sizes/adjust' && method === 'POST') {
    var caller = await needEmployee(req, res);
    if (!caller) return;
    var body = await readBodySafe(req, res);
    var delta = Number(body.delta), prodId = Number(body.productId), sz = Number(body.size);
    
    if (isNaN(delta) || isNaN(prodId) || isNaN(sz)) {
      return jsonRes(res, { error: 'Paramètres invalides.' }, 400);
    }

    try {
      // ✅ TRANSACTION: Ajustement taille + recalcul total produit
      var result = await withTransaction(async (client) => {
        // Vérifier taille existe
        var szRow = await client.query('SELECT qty FROM product_sizes WHERE product_id=$1 AND size=$2', [prodId, sz]);
        if (!szRow.rows.length) throw new Error('Taille introuvable.');
        
        var newQty = Math.max(0, +szRow.rows[0].qty + delta);
        await client.query('UPDATE product_sizes SET qty=$1 WHERE product_id=$2 AND size=$3', [newQty, prodId, sz]);
        
        // Recalcul total produit
        var tot = await client.query('SELECT COALESCE(SUM(qty),0) AS t FROM product_sizes WHERE product_id=$1', [prodId]);
        var total = +tot.rows[0].t;
        await client.query('UPDATE products SET qty=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2', [total, prodId]);
        
        return { newQty, total };
      });

      // Log mouvement (hors transaction)
      var pr = await Q('SELECT name,brand FROM products WHERE id=$1', [prodId]);
      await R('INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [prodId, pr[0]?.name, pr[0]?.brand, sz, delta > 0 ? 'in' : 'out', Math.abs(delta), 'Ajustement taille']);
      
      broadcast('stock_updated', { productId: prodId, size: sz, ...result });
      return jsonRes(res, result);
      
    } catch(e) {
      return jsonRes(res, { error: e.message }, 404);
    }
  }

  /* ── MOVEMENTS ─────────────────────────────────────────────── */
  
  if (pathname === '/api/movements') {
    
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      return jsonRes(res, await Q('SELECT * FROM stock_movements ORDER BY id DESC'));
    }

    // POST /api/movements ✅ TRANSACTION
    if (method === 'POST') {
      var caller = await needEmployee(req, res);
      if (!caller) return;
      var body = await readBodySafe(req, res);
      var mvPid = Number(body.product_id);
      var mvType = String(body.type || '').toLowerCase();
      var mvQty = Number(body.quantity);
      var mvSize = body.size !== undefined && body.size !== '' ? Number(body.size) : null;

      if (!mvPid || !['in','out'].includes(mvType) || mvQty <= 0) {
        return jsonRes(res, { error: 'Données invalides.' }, 400);
      }

      try {
        // ✅ TRANSACTION: Mouvement + update stocks atomiques
        var mvId = await withTransaction(async (client) => {
          // Créer le mouvement
          var r = await client.query(
            'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [mvPid, clean(body.product_name || ''), clean(body.brand || ''), mvSize, mvType, mvQty, clean(body.note || '')]
          );
          var id = r.rows[0].id;

          // Update quantité produit
          var cur = await client.query('SELECT qty FROM products WHERE id=$1', [mvPid]);
          if (cur.rows.length) {
            var nq = mvType === 'in' ? +cur.rows[0].qty + mvQty : Math.max(0, +cur.rows[0].qty - mvQty);
            await client.query('UPDATE products SET qty=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2', [nq, mvPid]);
          }

          // Update taille spécifique si précisée
          if (mvSize !== null) {
            var szR = await client.query('SELECT qty FROM product_sizes WHERE product_id=$1 AND size=$2', [mvPid, mvSize]);
            if (szR.rows.length) {
              var nSz = mvType === 'in' ? +szR.rows[0].qty + mvQty : Math.max(0, +szR.rows[0].qty - mvQty);
              await client.query('UPDATE product_sizes SET qty=$1 WHERE product_id=$2 AND size=$3', [nSz, mvPid, mvSize]);
            }
          }
          
          return id;
        });

        broadcast('movement_added', { id: mvId, productId: mvPid, type: mvType });
        return jsonRes(res, { id: mvId });
        
      } catch(e) {
        return jsonRes(res, { error: e.message }, 500);
      }
    }
  }

  /* ── BRANDS ───────────────────────────────────────────────── */
  if (pathname === '/api/brands') {
    if (method === 'GET') {
      return jsonRes(res, await Q('SELECT * FROM brands ORDER BY name'));
    }
    if (method === 'POST') {
      var caller = await needAdmin(req, res);
      if (!caller) return;
      var body = await readBodySafe(req, res);
      try {
        var id = await INSERT('INSERT INTO brands (name,country) VALUES ($1,$2) RETURNING id', [clean(body.name), clean(body.country)]);
        return jsonRes(res, { id }, 201);
      } catch(e) {
        return jsonRes(res, { error: 'Marque existe déjà.' }, 409);
      }
    }
  }

  /* ── USERS ───────────────────────────────────────────────── */
  if (pathname === '/api/users') {
    if (method === 'GET') {
      var adm = await needAdmin(req, res);
      if (!adm) return;
      return jsonRes(res, await Q('SELECT id,name,email,role,is_active FROM users'));
    }
  }

  /* ── STATS ────────────────────────────────────────────────── */
  if (pathname === '/api/stats' && method === 'GET') {
    var p = await getPayload(req);
    if (!p) return jsonRes(res, { error: 'Auth required' }, 401);
    var r = await Q(`SELECT COUNT(*) as total, COALESCE(SUM(qty),0) as totalUnits FROM products`);
    return jsonRes(res, { total: +r[0].total, totalUnits: +r[0].totalUnits, authenticated: true });
  }

  /* ── SSE Events ───────────────────────────────────────────── */
  if (pathname === '/api/events' && method === 'GET') {
    // ... (code SSE standard) ...
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.write('data: ' + JSON.stringify({ type: 'connected' }) + '\n\n');
    var client = { res };
    sseClients.add(client);
    req.on('close', () => sseClients.delete(client));
    return;
  }

  /* ── 404 ─────────────────────────────────────────────────── */
  return jsonRes(res, { error: 'Route inconnue: ' + pathname }, 404);
}

/* ════════════════════════════════════════════════════════════
   DÉMARRAGE
════════════════════════════════════════════════════════════ */

(async function start() {
  await initDB();
  redis.init(); // Step 1
  
  var server = http.createServer((req, res) => {
    handleRequest(req, res).catch(e => {
      console.error('[SERVER] Error:', e);
      jsonRes(res, { error: 'Erreur interne.' }, 500);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   BEN AMI SHOP v9 — Transactions Atomiques ✅   ║');
    console.log('║   URL: http://localhost:' + PORT + '                    ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('[REDIS] Status:', redis.getStatus());
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('\n[SERVER] Arrêt propre...');
    redis.shutdown().then(() => pool.end()).then(() => process.exit(0));
  });
})();

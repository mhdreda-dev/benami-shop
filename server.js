/**
 * BEN AMI SHOP — server.js  v8
 *
 * Migration SQLite → PostgreSQL
 * Driver : pg (node-postgres)
 * Paramètres : $1, $2, … (style PostgreSQL)
 * Inserts    : RETURNING id
 * Conflits   : ON CONFLICT DO NOTHING
 */

'use strict';

var http   = require('http');
var fs     = require('fs');
var path   = require('path');
var bcrypt = require('bcryptjs');
var jwt    = require('jsonwebtoken');
var { Pool } = require('pg');

/* ── .env ─────────────────────────────────────────────────────── */
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

/* ── Config ────────────────────────────────────────────────────── */
var PORT     = parseInt(process.env.PORT, 10) || 3000;
var HOST     = process.env.HOST      || '0.0.0.0';
var NODE_ENV = process.env.NODE_ENV  || 'development';
var IS_PROD  = NODE_ENV === 'production';
var CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

var JWT_SECRET = process.env.JWT_SECRET || 'benami_dev_secret_2026';
if (!process.env.JWT_SECRET) console.warn('[WARN] JWT_SECRET non défini — secret par défaut (dev)');
if (!process.env.DATABASE_URL) { console.error('[FATAL] DATABASE_URL non défini dans .env'); process.exit(1); }

console.log('[CONFIG] ENV=' + NODE_ENV + ' PORT=' + PORT);

/* ── Rate limiting ─────────────────────────────────────────────── */
var loginAttempts = {};
function checkRate(ip) {
  var now = Date.now();
  if (!loginAttempts[ip] || now > loginAttempts[ip].r) loginAttempts[ip] = { c: 0, r: now + 900000 };
  return ++loginAttempts[ip].c <= 10;
}
function resetRate(ip) { delete loginAttempts[ip]; }
setInterval(function() {
  var now = Date.now();
  Object.keys(loginAttempts).forEach(function(ip) { if (now > loginAttempts[ip].r) delete loginAttempts[ip]; });
}, 1800000);

/* ── Token blacklist ───────────────────────────────────────────── */
var revokedJti = new Set();
function revokeToken(jti) { if (jti) revokedJti.add(jti); }
function isRevoked(jti)   { return !!(jti && revokedJti.has(jti)); }

/* ── Security headers ──────────────────────────────────────────── */
var SEC_H = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'DENY',
  'X-XSS-Protection':       '1; mode=block',
  'Referrer-Policy':        'strict-origin-when-cross-origin',
  'Cache-Control':          'no-store',
};

var CORS_H = {
  'Access-Control-Allow-Origin' : CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age'      : '86400',
};

/* ── Helpers ───────────────────────────────────────────────────── */
function isEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 255; }
function isStr(s, n) { return typeof s === 'string' && s.trim().length > 0 && s.length <= (n || 500); }
function clean(s) { return typeof s === 'string' ? s.trim().slice(0, 1000) : ''; }
function def(v, fb) { return (v !== undefined && v !== null) ? v : fb; }

/* ── HTTP helpers ──────────────────────────────────────────────── */
function jsonRes(res, data, code) {
  var h = Object.assign({ 'Content-Type': 'application/json' }, CORS_H, SEC_H);
  res.writeHead(code || 200, h);
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise(function(ok) {
    var s = '';
    req.on('data', function(c) { s += c; });
    req.on('end', function() { try { ok(JSON.parse(s || '{}')); } catch(e) { ok({}); } });
  });
}
var MIME = {
  '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ico':'image/x-icon', '.webp':'image/webp',
};

/* ══════════════════════════════════════════════════════════════
   DATABASE — PostgreSQL (pg)
   ══════════════════════════════════════════════════════════════ */
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: IS_PROD ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', function(err) {
  console.error('[DB] ❌ Pool error:', err.message);
});

/* SELECT → array of row objects */
async function Q(sql, p) {
  var r = await pool.query(sql, p || []);
  return r.rows;
}

/* UPDATE / DELETE */
async function R(sql, p) {
  await pool.query(sql, p || []);
}

/* INSERT → returns new id (requires RETURNING id in sql) */
async function INSERT(sql, p) {
  var r = await pool.query(sql, p || []);
  return r.rows[0].id;
}

/* ── Auth ──────────────────────────────────────────────────────── */
async function getPayload(req) {
  var h = req.headers['authorization'] || '';
  if (!h.startsWith('Bearer ')) return null;
  try {
    var p = jwt.verify(h.slice(7), JWT_SECRET);
    if (isRevoked(p.jti)) return null;
    var r = await Q('SELECT is_active FROM users WHERE id=$1', [p.id]);
    if (!r.length || !r[0].is_active) return null;
    return p;
  } catch(e) { return null; }
}
async function needEmployee(req, res) {
  var p = await getPayload(req);
  if (!p)                                   { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (!['admin','employee'].includes(p.role)){ jsonRes(res, { error: 'Accès interdit.' }, 403); return null; }
  return p;
}
async function needAdmin(req, res) {
  var p = await getPayload(req);
  if (!p)               { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (p.role !== 'admin'){ jsonRes(res, { error: 'Accès réservé aux administrateurs.' }, 403); return null; }
  return p;
}
function denyEmp(res, why) {
  console.warn('[RBAC]', why);
  jsonRes(res, { error: 'Action réservée aux administrateurs.' }, 403);
}

/* ── Logger ────────────────────────────────────────────────────── */
async function log(p, action, target) {
  try {
    await pool.query(
      'INSERT INTO activity_logs (user_id,user_name,role,action,target) VALUES ($1,$2,$3,$4,$5)',
      [p ? p.id : 0, p ? p.email : 'system', p ? p.role : 'system', action, target || '']
    );
    console.log('[LOG]', p ? p.email : 'system', '|', action, '|', target || '');
  } catch(e) { console.error('[LOG]', e.message); }
}

/* ── Schéma ────────────────────────────────────────────────────── */
async function dbSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      country    TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      sku         TEXT NOT NULL UNIQUE,
      brand       TEXT NOT NULL DEFAULT '',
      price       NUMERIC(10,2) NOT NULL DEFAULT 0,
      qty         INTEGER NOT NULL DEFAULT 0,
      color       TEXT DEFAULT '',
      description TEXT DEFAULT '',
      img         TEXT DEFAULT '',
      sizes       TEXT DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_sizes (
      id         SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      size       INTEGER NOT NULL,
      qty        INTEGER NOT NULL DEFAULT 0,
      UNIQUE(product_id, size)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'employee',
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id           SERIAL PRIMARY KEY,
      product_id   INTEGER NOT NULL,
      product_name TEXT DEFAULT '',
      brand        TEXT DEFAULT '',
      size         INTEGER,
      type         TEXT NOT NULL,
      quantity     INTEGER NOT NULL,
      note         TEXT DEFAULT '',
      moved_at     TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL DEFAULT 0,
      user_name  TEXT NOT NULL DEFAULT 'system',
      role       TEXT NOT NULL DEFAULT 'system',
      action     TEXT NOT NULL,
      target     TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /* Ajout colonne is_active si migration depuis ancienne version */
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active INTEGER NOT NULL DEFAULT 1');
  } catch(e) {}

  /* Créer admin par défaut si table vide */
  var uc = await Q('SELECT COUNT(*) AS c FROM users');
  if (+uc[0].c === 0) {
    await pool.query(
      'INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,$3,$4,1)',
      ['Administrateur', 'admin@benami.shop', bcrypt.hashSync('admin123', 10), 'admin']
    );
    console.log('[AUTH] ✅ Admin créé → admin@benami.shop / admin123');
  }
  console.log('[DB] ✅ Schéma OK');
}

async function dbSeed() {
  var r = await Q('SELECT COUNT(*) AS c FROM brands');
  if (+r[0].c > 0) { console.log('[DB] Déjà remplie — seed ignoré'); return; }
  console.log('[DB] Seed...');

  var brands = [
    ['Nike','USA'],['Adidas','Germany'],['Puma','Germany'],['New Balance','USA'],
    ['Reebok','UK'],['Converse','USA'],['Vans','USA'],['Jordan','USA'],['Skechers','USA']
  ];
  for (var b of brands) {
    await pool.query('INSERT INTO brands (name,country) VALUES ($1,$2) ON CONFLICT DO NOTHING', b);
  }

  var products = [
    [1,'Nike Air Max 270','NK-AM270-BLK','Nike',1299,42,'Noir/Blanc','Running Air Max.','👟',[38,39,40,41,42,43]],
    [2,'Adidas Ultra Boost 23','AD-UB23-WHT','Adidas',1490,28,'Blanc','Technologie Boost.','🥾',[39,40,41,42,43,44]],
    [3,'Jordan 1 Retro High OG','JD-1RHOG-RED','Jordan',1899,0,'Rouge/Noir','Icone 1985.','👠',[40,41,42]],
    [4,'Puma RS-X3','PM-RSX3-GRY','Puma',849,15,'Gris/Bleu','Chunky retro.','👞',[37,38,39,40,41,42,43]],
    [5,'New Balance 574','NB-574-NVY','New Balance',990,5,'Marine','Classique 1988.','🥿',[40,41,42,43]],
    [6,'Converse Chuck 70','CV-C70-BLK','Converse',699,33,'Noir','Canvas vintage.','👟',[36,37,38,39,40,41,42,43,44]],
    [7,'Vans Old Skool','VN-OS-CHKR','Vans',649,0,'Checker','Skate 1977.','👟',[38,39,40,41,42]],
    [8,'Reebok Club C 85','RB-CC85-WHT','Reebok',750,22,'Blanc/Vert','Tennis vintage.','👟',[38,39,40,41,42,43,44]],
    [9,'Nike Dunk Low','NK-DL-GRY','Nike',1099,18,'Gris/Blanc','Basket retro.','👟',[38,39,40,41,42,43]],
    [10,'Adidas Samba OG','AD-SBG-BLK','Adidas',899,11,'Noir/Blanc','Football indoor.','👞',[39,40,41,42,43]]
  ];
  for (var p of products) {
    await pool.query(
      'INSERT INTO products (id,name,sku,brand,price,qty,color,description,img,sizes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',
      [p[0],p[1],p[2],p[3],p[4],p[5],p[6],p[7],p[8],JSON.stringify(p[9])]
    );
    var base = p[9].length && p[5] > 0 ? Math.floor(p[5] / p[9].length) : 0;
    for (var sz of p[9]) {
      await pool.query(
        'INSERT INTO product_sizes (product_id,size,qty) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [p[0], sz, base]
      );
    }
  }

  /* Resynchronise les séquences après insertion avec ID explicites */
  await pool.query("SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))");

  var movements = [
    [1,'Nike Air Max 270','Nike',40,'in',50,'Stock initial'],
    [2,'Adidas Ultra Boost 23','Adidas',41,'in',30,'Stock initial'],
    [3,'Jordan 1 Retro High OG','Jordan',41,'in',10,'Stock initial'],
    [3,'Jordan 1 Retro High OG','Jordan',41,'out',10,'Tout vendu'],
    [5,'New Balance 574','NB',42,'out',10,'Stock faible'],
    [6,'Converse Chuck 70','Converse',40,'in',40,'Reception'],
  ];
  for (var mv of movements) {
    await pool.query(
      'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      mv
    );
  }
  console.log('[DB] ✅ Seed OK');
}

/* ══════════════════════════════════════════════════════════════
   DÉMARRAGE
   ══════════════════════════════════════════════════════════════ */
(async function start() {
  try {
    /* Vérifier la connexion */
    var client = await pool.connect();
    client.release();
    console.log('[DB] ✅ Connexion PostgreSQL OK');

    await dbSchema();
    await dbSeed();

    var server = http.createServer(function(req, res) {
      handleRequest(req, res).catch(function(err) {
        console.error('[SERVER] ❌', err.message, err.stack ? err.stack.split('\n')[1] : '');
        try { jsonRes(res, { error: 'Erreur interne.' }, 500); } catch(e) {}
      });
    });

    function shutdown(sig) {
      console.log('\n[SERVER] ' + sig + ' → arrêt propre');
      server.close(function() {
        pool.end(function() {
          console.log('[DB] ✅ Pool PostgreSQL fermé');
          process.exit(0);
        });
      });
      setTimeout(function() { process.exit(1); }, 8000);
    }
    process.on('SIGTERM', function() { shutdown('SIGTERM'); });
    process.on('SIGINT',  function() { shutdown('SIGINT'); });
    process.on('uncaughtException', function(err) {
      console.error('[UNCAUGHT] ❌', err.message);
      if (IS_PROD) { pool.end(); process.exit(1); }
    });
    process.on('unhandledRejection', function(r) {
      console.error('[REJECTION] ❌', r);
      if (IS_PROD) { pool.end(); process.exit(1); }
    });

    server.listen(PORT, HOST, function() {
      console.log('');
      console.log('╔══════════════════════════════════════════════════╗');
      console.log('║   BEN AMI SHOP v8 — PostgreSQL  ✅                ║');
      console.log('║   URL   : http://localhost:' + PORT + '                ║');
      console.log('║   DB    : PostgreSQL (pg pool)                   ║');
      console.log('║   Login : admin@benami.shop / admin123           ║');
      console.log('╚══════════════════════════════════════════════════╝');
      console.log('');
    });

    if (!IS_PROD && process.platform === 'darwin') {
      setTimeout(function() { require('child_process').exec('open http://localhost:' + PORT); }, 600);
    }
  } catch(err) {
    console.error('[FATAL] Impossible de démarrer:', err.message);
    process.exit(1);
  }
})();

/* ══════════════════════════════════════════════════════════════
   ROUTEUR
   ══════════════════════════════════════════════════════════════ */
async function handleRequest(req, res) {
  var url      = new URL(req.url, 'http://localhost:' + PORT);
  var method   = req.method.toUpperCase();
  var pathname = url.pathname;

  if (method === 'OPTIONS') { res.writeHead(204, CORS_H); res.end(); return; }
  if (pathname.startsWith('/api/')) console.log('[' + method + '] ' + pathname);

  /* ── Fichiers statiques ────────────────────────────────────── */
  if (!pathname.startsWith('/api/')) {
    var fp = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!fp.startsWith(__dirname)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (!fs.existsSync(fp)) { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found: ' + pathname); return; }

    var ext   = path.extname(fp).toLowerCase();
    var cType = MIME[ext] || 'application/octet-stream';
    var staticHeaders = { 'Content-Type': cType };
    if (ext === '.html' || ext === '.js') {
      staticHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      staticHeaders['Pragma']        = 'no-cache';
      staticHeaders['Expires']       = '0';
    } else {
      staticHeaders['Cache-Control'] = 'public, max-age=3600';
    }
    res.writeHead(200, staticHeaders);
    fs.createReadStream(fp).pipe(res);
    return;
  }

  /* ── /api/ping ─────────────────────────────────────────────── */
  if (pathname === '/api/ping' && method === 'GET') {
    return jsonRes(res, { alive: true, server: 'benami-shop', version: 'v8', ts: Date.now() });
  }

  /* ── /api/stats ─────────────────────────────────────────────── */
  if (pathname === '/api/stats' && method === 'GET') {
    var p = await getPayload(req);
    if (!p || !['admin','employee'].includes(p.role)) {
      console.log('[STATS] Ping non-auth → 200');
      return jsonRes(res, { authenticated: false, server: 'benami-shop', version: 'v8' });
    }
    var rows = await Q(`
      SELECT
        COUNT(*)                                          AS total,
        COALESCE(SUM(qty), 0)                             AS "totalUnits",
        COALESCE(SUM(CASE WHEN qty=0 THEN 1 ELSE 0 END), 0) AS "outOfStock",
        COALESCE(SUM(CASE WHEN qty>0 AND qty<=5 THEN 1 ELSE 0 END), 0) AS "lowStock",
        COALESCE(SUM(price*qty), 0)                       AS "totalValue"
      FROM products
    `);
    var s = rows[0] || {};
    s.authenticated = true;
    /* Normalise les types retournés par pg (bigint → number) */
    s.total      = +s.total;
    s.totalUnits = +s.totalUnits;
    s.outOfStock = +s.outOfStock;
    s.lowStock   = +s.lowStock;
    s.totalValue = +s.totalValue;
    console.log('[STATS] →', JSON.stringify(s));
    return jsonRes(res, s);
  }

  /* ── /api/brands ────────────────────────────────────────────── */
  if (pathname === '/api/brands') {
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      var rows = await Q('SELECT * FROM brands ORDER BY name');
      console.log('[BRANDS] GET →', rows.length);
      return jsonRes(res, rows);
    }
    if (method === 'POST') {
      var caller = await needAdmin(req, res); if (!caller) return;
      var body = await readBody(req);
      var bname = clean(body.name || '');
      if (!bname) return jsonRes(res, { error: 'name requis.' }, 400);
      try {
        var bid = await INSERT(
          'INSERT INTO brands (name,country) VALUES ($1,$2) RETURNING id',
          [bname, clean(body.country || '')]
        );
        console.log('[BRANDS] POST ✅ id=' + bid + ' name=' + bname);
        log(caller, 'ADD_BRAND', bname);
        return jsonRes(res, { id: bid, name: bname, country: body.country || '' }, 201);
      } catch(e) { return jsonRes(res, { error: e.message }, 409); }
    }
  }

  /* ── /api/products ──────────────────────────────────────────── */
  if (pathname === '/api/products') {
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      var rows = await Q('SELECT * FROM products ORDER BY id DESC');
      var result = rows.map(function(p) {
        return Object.assign({}, p, {
          sizes: JSON.parse(p.sizes || '[]'),
          description: p.description || '',
          desc: p.description || '',
          price: +p.price,
          qty: +p.qty,
        });
      });
      console.log('[PRODUCTS] GET →', result.length);
      return jsonRes(res, result);
    }
    if (method === 'POST') {
      var caller = await needAdmin(req, res); if (!caller) return;
      var body = await readBody(req);
      var pname  = clean(body.name  || '');
      var psku   = clean(body.sku   || '');
      var pbrand = clean(body.brand || '');
      console.log('[PRODUCTS] POST name=' + pname + ' sku=' + psku + ' qty=' + body.qty);
      if (!pname || !psku || !pbrand) return jsonRes(res, { error: 'name, sku, brand requis.' }, 400);
      try {
        var newId = await INSERT(
          'INSERT INTO products (name,sku,brand,price,qty,color,description,img,sizes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
          [pname, psku, pbrand, body.price || 0, body.qty || 0,
           clean(body.color || ''), clean(body.description || body.desc || ''),
           body.img || '👟', JSON.stringify(Array.isArray(body.sizes) ? body.sizes : [])]
        );
        console.log('[PRODUCTS] POST ✅ id=' + newId);
        var szArr = Array.isArray(body.sizes) ? body.sizes : [];
        var base  = szArr.length && body.qty > 0 ? Math.floor(body.qty / szArr.length) : 0;
        for (var s of szArr) {
          await R('INSERT INTO product_sizes (product_id,size,qty) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [newId, s, base]);
        }
        if (body.qty > 0) {
          await R(
            'INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6)',
            [newId, pname, pbrand, 'in', body.qty, 'Stock initial']
          );
        }
        log(caller, 'ADD_PRODUCT', pname + ' SKU:' + psku);
        return jsonRes(res, { id: newId }, 201);
      } catch(e) { console.error('[PRODUCTS] POST ❌', e.message); return jsonRes(res, { error: e.message }, 409); }
    }
  }

  /* ── /api/products/:id ──────────────────────────────────────── */
  var mP = pathname.match(/^\/api\/products\/(\d+)$/);
  if (mP) {
    var pid = +mP[1];
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      var rows = await Q('SELECT * FROM products WHERE id=$1', [pid]);
      if (!rows.length) return jsonRes(res, { error: 'Produit introuvable.' }, 404);
      var row = rows[0];
      var sizesData = await Q('SELECT size,qty FROM product_sizes WHERE product_id=$1 ORDER BY size', [pid]);
      return jsonRes(res, Object.assign({}, row, {
        sizes: JSON.parse(row.sizes || '[]'),
        description: row.description || '',
        desc: row.description || '',
        price: +row.price,
        qty: +row.qty,
        sizesData: sizesData,
      }));
    }
    if (method === 'PUT') {
      var caller = await needAdmin(req, res); if (!caller) return;
      var body = await readBody(req);
      var olds = await Q('SELECT * FROM products WHERE id=$1', [pid]);
      if (!olds.length) return jsonRes(res, { error: 'Produit introuvable.' }, 404);
      var o  = olds[0];
      var uN = body.name  ? clean(body.name)  : o.name;
      var uS = body.sku   ? clean(body.sku)   : o.sku;
      var uB = body.brand ? clean(body.brand) : o.brand;
      var uP = def(body.price, o.price);
      var uQ = def(body.qty,   o.qty);
      var uC = clean(def(body.color, o.color || ''));
      var uI = body.img || o.img;
      var uD = body.description !== undefined ? clean(body.description) :
               (body.desc !== undefined ? clean(body.desc) : (o.description || ''));
      var uSz = JSON.stringify(Array.isArray(body.sizes) ? body.sizes : JSON.parse(o.sizes || '[]'));
      await R(
        'UPDATE products SET name=$1,sku=$2,brand=$3,price=$4,qty=$5,color=$6,description=$7,img=$8,sizes=$9,updated_at=CURRENT_TIMESTAMP WHERE id=$10',
        [uN, uS, uB, uP, uQ, uC, uD, uI, uSz, pid]
      );
      if (Array.isArray(body.sizesData)) {
        await R('DELETE FROM product_sizes WHERE product_id=$1', [pid]);
        for (var sd of body.sizesData) {
          await R('INSERT INTO product_sizes (product_id,size,qty) VALUES ($1,$2,$3)', [pid, sd.size, sd.qty || 0]);
        }
      }
      if (+uQ !== +o.qty) {
        var diff = +uQ - +o.qty;
        await R(
          'INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6)',
          [pid, uN, uB, diff > 0 ? 'in' : 'out', Math.abs(diff), 'Ajustement (' + (diff > 0 ? '+' : '') + diff + ')']
        );
      }
      console.log('[PRODUCTS] PUT ✅ id=' + pid);
      log(caller, 'UPDATE_PRODUCT', uN + ' id:' + pid);
      return jsonRes(res, { success: true });
    }
    if (method === 'DELETE') {
      var caller = await needAdmin(req, res); if (!caller) return;
      var rows = await Q('SELECT name FROM products WHERE id=$1', [pid]);
      if (!rows.length) return jsonRes(res, { error: 'Produit introuvable.' }, 404);
      await R('DELETE FROM product_sizes WHERE product_id=$1', [pid]);
      await R('DELETE FROM products WHERE id=$1', [pid]);
      console.log('[PRODUCTS] DELETE ✅ id=' + pid);
      log(caller, 'DELETE_PRODUCT', rows[0].name + ' id:' + pid);
      return jsonRes(res, { success: true });
    }
  }

  /* ── /api/sizes ─────────────────────────────────────────────── */
  var mSz = pathname.match(/^\/api\/sizes\/(\d+)$/);
  if (mSz && method === 'GET') {
    if (!await needEmployee(req, res)) return;
    return jsonRes(res, await Q('SELECT size,qty FROM product_sizes WHERE product_id=$1 ORDER BY size', [+mSz[1]]));
  }

  if (pathname === '/api/sizes/adjust' && method === 'POST') {
    var caller = await needEmployee(req, res); if (!caller) return;
    var body  = await readBody(req);
    var delta  = Number(body.delta);
    var prodId = Number(body.productId);
    var sz     = Number(body.size);
    if (isNaN(delta) || isNaN(prodId) || isNaN(sz)) return jsonRes(res, { error: 'productId, size, delta requis.' }, 400);
    if (caller.role === 'employee' && delta < 0) return denyEmp(res, 'delta négatif');
    var szRow = await Q('SELECT qty FROM product_sizes WHERE product_id=$1 AND size=$2', [prodId, sz]);
    if (!szRow.length) return jsonRes(res, { error: 'Taille introuvable.' }, 404);
    var newQty = Math.max(0, +szRow[0].qty + delta);
    await R('UPDATE product_sizes SET qty=$1 WHERE product_id=$2 AND size=$3', [newQty, prodId, sz]);
    var tot   = await Q('SELECT COALESCE(SUM(qty),0) AS t FROM product_sizes WHERE product_id=$1', [prodId]);
    var total = +tot[0].t;
    await R('UPDATE products SET qty=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2', [total, prodId]);
    var pr = await Q('SELECT name,brand FROM products WHERE id=$1', [prodId]);
    await R(
      'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [prodId, pr[0] ? pr[0].name : '', pr[0] ? pr[0].brand : '', sz, delta > 0 ? 'in' : 'out', Math.abs(delta),
       body.note || 'Ajustement taille ' + sz]
    );
    console.log('[SIZES] adjust ✅ produit=' + prodId + ' taille=' + sz + ' delta=' + delta + ' newQty=' + newQty + ' total=' + total);
    log(caller,
      delta > 0 ? 'STOCK_IN' : 'STOCK_OUT',
      (pr[0] ? pr[0].name : 'produit#' + prodId) + ' t=' + sz + ' d=' + (delta > 0 ? '+' : '') + delta
    );
    return jsonRes(res, { newQty: newQty, total: total });
  }

  /* ── /api/movements ─────────────────────────────────────────── */
  if (pathname === '/api/movements') {
    if (method === 'GET') {
      if (!await needEmployee(req, res)) return;
      var rows = await Q('SELECT * FROM stock_movements ORDER BY id DESC');
      console.log('[MOVEMENTS] GET →', rows.length);
      return jsonRes(res, rows);
    }
    if (method === 'POST') {
      var caller = await needEmployee(req, res); if (!caller) return;
      var body   = await readBody(req);
      var mvPid  = Number(body.product_id);
      var mvType = String(body.type || '');
      var mvQty  = Number(body.quantity);
      console.log('[MOVEMENTS] POST product_id=' + mvPid + ' type=' + mvType + ' qty=' + mvQty);
      if (!mvPid || !mvType || !mvQty) return jsonRes(res, { error: 'product_id, type, quantity requis.' }, 400);
      if (caller.role === 'employee' && mvType !== 'in') return denyEmp(res, 'type=' + mvType);
      var mvId = await INSERT(
        'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [mvPid, clean(body.product_name || ''), clean(body.brand || ''), body.size || null, mvType, mvQty, clean(body.note || '')]
      );
      var cur = await Q('SELECT qty FROM products WHERE id=$1', [mvPid]);
      if (cur.length) {
        var nq = mvType === 'in' ? +cur[0].qty + mvQty : Math.max(0, +cur[0].qty - mvQty);
        await R('UPDATE products SET qty=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2', [nq, mvPid]);
        if (body.size) {
          var szR = await Q('SELECT qty FROM product_sizes WHERE product_id=$1 AND size=$2', [mvPid, body.size]);
          if (szR.length) {
            var nSz = mvType === 'in' ? +szR[0].qty + mvQty : Math.max(0, +szR[0].qty - mvQty);
            await R('UPDATE product_sizes SET qty=$1 WHERE product_id=$2 AND size=$3', [nSz, mvPid, body.size]);
          }
        }
      }
      console.log('[MOVEMENTS] POST ✅ id=' + mvId);
      log(caller,
        mvType === 'in' ? 'STOCK_IN' : 'STOCK_OUT',
        (body.product_name || '#' + mvPid) + ' qty=' + mvQty + (body.size ? ' t=' + body.size : '')
      );
      return jsonRes(res, { id: mvId });
    }
  }

  /* ── /api/login ─────────────────────────────────────────────── */
  if (pathname === '/api/login' && method === 'POST') {
    var ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRate(ip)) return jsonRes(res, { error: 'Trop de tentatives.' }, 429);
    var body = await readBody(req);
    var em   = clean(body.email || '').toLowerCase();
    var pw   = body.password || '';
    console.log('[AUTH] Login:', em);
    if (!isEmail(em) || !pw) return jsonRes(res, { error: 'Email ou mot de passe invalide.' }, 400);
    var users = await Q('SELECT * FROM users WHERE email=$1', [em]);
    if (!users.length) { bcrypt.hashSync('dummy', 10); return jsonRes(res, { error: 'Identifiants incorrects.' }, 401); }
    var u = users[0];
    if (!bcrypt.compareSync(pw, u.password)) return jsonRes(res, { error: 'Identifiants incorrects.' }, 401);
    if (!u.is_active) return jsonRes(res, { error: 'Compte désactivé.' }, 403);
    var jti   = u.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var token = jwt.sign({ id: u.id, email: u.email, role: u.role, jti: jti }, JWT_SECRET, { expiresIn: '7d' });
    resetRate(ip);
    console.log('[AUTH] ✅', em, 'role=' + u.role);
    log({ id: u.id, email: u.email, role: u.role }, 'LOGIN', 'IP:' + ip);
    return jsonRes(res, { token: token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  }

  /* ── /api/register ──────────────────────────────────────────── */
  if (pathname === '/api/register' && method === 'POST') {
    var body = await readBody(req);
    var rn   = clean(body.name  || '');
    var re   = clean(body.email || '').toLowerCase();
    var rp   = body.password || '';
    var rr   = body.role || 'employee';
    if (!isStr(rn, 100)) return jsonRes(res, { error: 'Nom invalide.' }, 400);
    if (!isEmail(re))    return jsonRes(res, { error: 'Email invalide.' }, 400);
    if (rp.length < 8)   return jsonRes(res, { error: 'Mot de passe trop court (min 8).' }, 400);
    var role = ['employee','admin'].includes(rr) ? rr : 'employee';
    if ((await Q('SELECT id FROM users WHERE email=$1', [re])).length) return jsonRes(res, { error: 'Email déjà utilisé.' }, 409);
    var uid = await INSERT(
      'INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,$3,$4,1) RETURNING id',
      [rn, re, bcrypt.hashSync(rp, 12), role]
    );
    console.log('[AUTH] Register ✅', re);
    return jsonRes(res, { id: uid, message: 'Compte créé.' }, 201);
  }

  /* ── /api/logout ────────────────────────────────────────────── */
  if (pathname === '/api/logout' && method === 'POST') {
    var p = await getPayload(req);
    if (p && p.jti) { revokeToken(p.jti); log(p, 'LOGOUT', p.email); }
    return jsonRes(res, { success: true });
  }

  /* ── /api/me ────────────────────────────────────────────────── */
  if (pathname === '/api/me' && method === 'GET') {
    var p = await getPayload(req);
    if (!p) return jsonRes(res, { error: 'Token requis.' }, 401);
    var rows = await Q('SELECT id,name,email,role,is_active,created_at FROM users WHERE id=$1', [p.id]);
    if (!rows.length) return jsonRes(res, { error: 'Introuvable.' }, 404);
    if (!rows[0].is_active) return jsonRes(res, { error: 'Compte désactivé.' }, 403);
    return jsonRes(res, rows[0]);
  }

  /* ── /api/users ─────────────────────────────────────────────── */
  if (pathname === '/api/users') {
    if (method === 'GET') {
      var adm = await needAdmin(req, res); if (!adm) return;
      return jsonRes(res, await Q('SELECT id,name,email,role,is_active,created_at FROM users ORDER BY id'));
    }
    if (method === 'POST') {
      var adm  = await needAdmin(req, res); if (!adm) return;
      var body = await readBody(req);
      var un   = clean(body.name  || '');
      var ue   = clean(body.email || '').toLowerCase();
      var up   = body.password || '';
      var ur   = body.role || 'employee';
      if (!isStr(un, 100)) return jsonRes(res, { error: 'Nom invalide.' }, 400);
      if (!isEmail(ue))    return jsonRes(res, { error: 'Email invalide.' }, 400);
      if (up.length < 8)   return jsonRes(res, { error: 'Mot de passe trop court (min 8).' }, 400);
      var uRole = ['employee','admin'].includes(ur) ? ur : 'employee';
      if ((await Q('SELECT id FROM users WHERE email=$1', [ue])).length) return jsonRes(res, { error: 'Email déjà utilisé.' }, 409);
      var uid = await INSERT(
        'INSERT INTO users (name,email,password,role,is_active) VALUES ($1,$2,$3,$4,1) RETURNING id',
        [un, ue, bcrypt.hashSync(up, 12), uRole]
      );
      log(adm, 'CREATE_USER', ue + ' role=' + uRole);
      return jsonRes(res, { id: uid, name: un, email: ue, role: uRole, is_active: 1 }, 201);
    }
  }

  var mU = pathname.match(/^\/api\/users\/(\d+)$/);
  if (mU) {
    var adm = await needAdmin(req, res); if (!adm) return;
    var uid = +mU[1];
    if (method === 'PUT') {
      var body = await readBody(req);
      var ex   = await Q('SELECT * FROM users WHERE id=$1', [uid]);
      if (!ex.length) return jsonRes(res, { error: 'Introuvable.' }, 404);
      var o  = ex[0];
      var N  = body.name  ? body.name.trim()        : o.name;
      var E  = body.email ? body.email.toLowerCase() : o.email;
      var Ro = ['employee','admin'].includes(body.role) ? body.role : o.role;
      var A  = body.is_active !== undefined ? (body.is_active ? 1 : 0) : o.is_active;
      if (body.password && body.password.length >= 8) {
        await R('UPDATE users SET name=$1,email=$2,password=$3,role=$4,is_active=$5 WHERE id=$6',
          [N, E, bcrypt.hashSync(body.password, 10), Ro, A, uid]);
      } else {
        await R('UPDATE users SET name=$1,email=$2,role=$3,is_active=$4 WHERE id=$5', [N, E, Ro, A, uid]);
      }
      return jsonRes(res, { success: true });
    }
    if (method === 'DELETE') {
      if (uid === adm.id) return jsonRes(res, { error: 'Impossible de supprimer votre propre compte.' }, 400);
      if (!(await Q('SELECT id FROM users WHERE id=$1', [uid])).length) return jsonRes(res, { error: 'Introuvable.' }, 404);
      await R('DELETE FROM users WHERE id=$1', [uid]);
      return jsonRes(res, { success: true });
    }
  }

  /* ── /api/logs ──────────────────────────────────────────────── */
  if (pathname === '/api/logs') {
    var adm = await needAdmin(req, res); if (!adm) return;
    if (method === 'GET') {
      var act  = url.searchParams.get('action')  || '';
      var uid2 = url.searchParams.get('user_id') || '';
      var from = url.searchParams.get('from')    || '';
      var to   = url.searchParams.get('to')      || '';
      var lim  = Math.min(parseInt(url.searchParams.get('limit')  || '200'), 500);
      var off  = parseInt(url.searchParams.get('offset') || '0');
      var idx    = 1;
      var where  = '1=1';
      var params = [];
      if (act)  { where += ' AND action=$'      + idx++; params.push(act);  }
      if (uid2) { where += ' AND user_id=$'     + idx++; params.push(+uid2); }
      if (from) { where += ' AND created_at>=$' + idx++; params.push(from); }
      if (to)   { where += ' AND created_at<=$' + idx++; params.push(to + ' 23:59:59'); }
      var tot  = await Q('SELECT COUNT(*) AS c FROM activity_logs WHERE ' + where, params);
      var logs = await Q(
        'SELECT * FROM activity_logs WHERE ' + where + ' ORDER BY created_at DESC LIMIT $' + idx + ' OFFSET $' + (idx + 1),
        params.concat([lim, off])
      );
      return jsonRes(res, { total: +tot[0].c, logs: logs });
    }
    if (method === 'DELETE') {
      await R('DELETE FROM activity_logs');
      log(adm, 'LOGS_PURGED', 'all');
      return jsonRes(res, { success: true });
    }
  }

  /* ── 404 ────────────────────────────────────────────────────── */
  console.warn('[404]', method, pathname);
  return jsonRes(res, { error: 'Route inconnue: ' + pathname }, 404);
}

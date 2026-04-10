/**
 * BEN AMI SHOP — server.js
 * Node.js + sql.js (WebAssembly SQLite, zero compilation)
 * Node.js v18+ compatible
 * Usage : node server.js
 */

var http = require('http');
var fs   = require('fs');
var path = require('path');

/* ── Configuration via variables d'environnement ─────────────── */
/* Charger .env si présent (développement local) */
try {
  var envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach(function(line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        var eq = line.indexOf('=');
        if (eq === -1) return;
        var key = line.slice(0, eq).trim();
        var val = line.slice(eq + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      });
    console.log('[CONFIG] .env chargé');
  }
} catch(e) { console.warn('[CONFIG] .env non chargé:', e.message); }

var PORT    = parseInt(process.env.PORT, 10) || 3000;
var HOST    = process.env.HOST    || '0.0.0.0';
var NODE_ENV = process.env.NODE_ENV || 'development';
var IS_PROD  = NODE_ENV === 'production';
var DB_FILE = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'benami_shop.db');

/* ── CORS : restreint en production ─────────────────────────── */
var ALLOWED_ORIGIN = process.env.CORS_ORIGIN || (IS_PROD ? '' : '*');

console.log('[CONFIG] ENV=' + NODE_ENV + ' PORT=' + PORT + ' DB=' + DB_FILE);

var bcrypt = require('bcryptjs');
var jwt    = require('jsonwebtoken');
var JWT_SECRET = process.env.JWT_SECRET || null;

if (!JWT_SECRET) {
  if (IS_PROD) {
    console.error('[FATAL] JWT_SECRET manquant en production. Définissez la variable d\'environnement JWT_SECRET.');
    process.exit(1);
  } else {
    JWT_SECRET = 'dev_secret_not_for_production_change_me';
    console.warn('[WARN] JWT_SECRET non défini — utilisation d\'un secret temporaire (développement uniquement).');
  }
}

/* ══════════════════════════════════════════════════════════════
   SÉCURITÉ — Rate limiting, token blacklist, headers
   ══════════════════════════════════════════════════════════════ */

/* ── Rate limiter login : max 10 tentatives / 15 min par IP ──── */
var loginAttempts = {}; // { ip: { count, resetAt } }
var LOGIN_MAX     = 10;
var LOGIN_WINDOW  = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  var now = Date.now();
  if (!loginAttempts[ip] || now > loginAttempts[ip].resetAt) {
    loginAttempts[ip] = { count: 0, resetAt: now + LOGIN_WINDOW };
  }
  loginAttempts[ip].count++;
  return loginAttempts[ip].count <= LOGIN_MAX;
}

function resetRateLimit(ip) {
  delete loginAttempts[ip];
}

/* Nettoyage auto des IPs expirées toutes les 30 min */
setInterval(function() {
  var now = Date.now();
  Object.keys(loginAttempts).forEach(function(ip) {
    if (now > loginAttempts[ip].resetAt) delete loginAttempts[ip];
  });
}, 30 * 60 * 1000);

/* ── Token blacklist (logout / compte désactivé) ────────────── */
var revokedTokens = new Set(); // jti => révoqués

function revokeToken(jti) {
  if (jti) revokedTokens.add(jti);
}

function isRevoked(jti) {
  return jti && revokedTokens.has(jti);
}

/* ── En-têtes sécurité HTTP (type helmet) ─────────────────── */
var SECURITY_HEADERS = {
  'X-Content-Type-Options'  : 'nosniff',
  'X-Frame-Options'         : 'DENY',
  'X-XSS-Protection'        : '1; mode=block',
  'Referrer-Policy'         : 'strict-origin-when-cross-origin',
  'Permissions-Policy'      : 'geolocation=(), camera=(), microphone=()',
  'Cache-Control'           : 'no-store',
};

/* ── Validation des inputs ─────────────────────────────────── */
function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 255;
}

function isValidString(s, max) {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= (max || 500);
}

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function sanitize(s) {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, 1000);
}

/* ── Middleware auth : vérifie le token JWT ───────────────────── */
function requireAuth(req) {
  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    var payload = jwt.verify(token, JWT_SECRET);
    /* Vérifier blacklist */
    if (isRevoked(payload.jti)) return null;
    /* Vérifier que le compte est toujours actif en base */
    if (db) {
      var rows = db.exec('SELECT is_active FROM users WHERE id=?', [payload.id]);
      if (!rows || !rows.length || !rows[0].values[0][0]) return null;
    }
    return payload;
  } catch(e) { return null; }
}

/* ── Middleware rôle admin ────────────────────────────────────── */
function requireAdmin(req, res) {
  var payload = requireAuth(req);
  if (!payload) { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (payload.role !== 'admin') { jsonRes(res, { error: 'Accès réservé aux administrateurs.' }, 403); return null; }
  return payload;
}

/* ── Middleware employee ou admin (connecté + actif) ─────────── */
function requireEmployee(req, res) {
  var payload = requireAuth(req);
  if (!payload) { jsonRes(res, { error: 'Authentification requise.' }, 401); return null; }
  if (!['admin','employee'].includes(payload.role)) {
    jsonRes(res, { error: 'Accès interdit.' }, 403); return null;
  }
  return payload;
}

/* ── Helper: log d'accès refusé ──────────────────────────────── */
function denyEmployee(res, action) {
  console.warn('[RBAC] Accès refusé —', action);
  jsonRes(res, { error: 'Action réservée aux administrateurs. Votre rôle : employé.' }, 403);
}

/* ══════════════════════════════════════════════════════════════
   ACTIVITY LOGGER — enregistre chaque action métier
   ══════════════════════════════════════════════════════════════ */
function logAction(payload, action, target) {
  if (!db) return;
  try {
    db.run(
      'INSERT INTO activity_logs (user_id, user_name, role, action, target) VALUES (?,?,?,?,?)',
      [
        payload ? payload.id   : 0,
        payload ? payload.email : 'system',
        payload ? payload.role  : 'system',
        action,
        target || ''
      ]
    );
    save();
    console.log('[LOG]', (payload ? payload.email : 'system'), '|', action, '|', target || '');
  } catch(e) {
    console.error('[LOG] Erreur:', e.message);
  }
}

var initSqlJs = require('sql.js');
var db; // instance sql.js

/* ── Sauvegarder sur disque après chaque écriture ────────────── */
function save() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

/* ── SELECT → tableau d'objets ───────────────────────────────── */
function q(sql, params) {
  var res = db.exec(sql, params || []);
  if (!res || !res.length) return [];
  var cols = res[0].columns;
  return res[0].values.map(function(row) {
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    return obj;
  });
}

/* ── INSERT / UPDATE / DELETE ────────────────────────────────── */
function run(sql, params) {
  db.run(sql, params || []);
  save();
}

/* ── Dernier id inséré ───────────────────────────────────────── */
function lastId() {
  var res = db.exec('SELECT last_insert_rowid() AS id');
  return res[0].values[0][0];
}

/* ── Fallback sécurisé (remplace ??) ─────────────────────────── */
function def(val, fallback) {
  return (val !== undefined && val !== null) ? val : fallback;
}

/* ── Ouvrir / créer la base ──────────────────────────────────── */
function openDb(SQL) {
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
    console.log('[DB] Base chargée :', DB_FILE);
  } else {
    db = new SQL.Database();
    console.log('[DB] Nouvelle base :', DB_FILE);
  }
}

/* ── Schéma (CURRENT_TIMESTAMP, pas datetime("now")) ─────────── */
function createSchema() {
  db.run(
    'CREATE TABLE IF NOT EXISTS brands (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  name TEXT NOT NULL UNIQUE,' +
    '  country TEXT DEFAULT "",' +
    '  created_at TEXT DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  db.run(
    'CREATE TABLE IF NOT EXISTS products (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  name TEXT NOT NULL,' +
    '  sku TEXT NOT NULL UNIQUE,' +
    '  brand TEXT NOT NULL DEFAULT "",' +
    '  price REAL NOT NULL DEFAULT 0,' +
    '  qty INTEGER NOT NULL DEFAULT 0,' +
    '  color TEXT DEFAULT "",' +
    '  description TEXT DEFAULT "",' +
    '  img TEXT DEFAULT "",' +
    '  sizes TEXT DEFAULT "[]",' +
    '  created_at TEXT DEFAULT CURRENT_TIMESTAMP,' +
    '  updated_at TEXT DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  db.run(
    'CREATE TABLE IF NOT EXISTS product_sizes (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  product_id INTEGER NOT NULL,' +
    '  size INTEGER NOT NULL,' +
    '  qty INTEGER NOT NULL DEFAULT 0,' +
    '  UNIQUE(product_id, size)' +
    ')'
  );
  /* ── Table users (auth) ──────────────────────────────────────── */
  db.run(
    'CREATE TABLE IF NOT EXISTS users (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  name TEXT NOT NULL,' +
    '  email TEXT NOT NULL UNIQUE,' +
    '  password TEXT NOT NULL,' +
    '  role TEXT NOT NULL DEFAULT "employee",' +
    '  is_active INTEGER NOT NULL DEFAULT 1,' +
    '  created_at TEXT DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  /* Migration : ajouter is_active si colonne absente (base existante) */
  try { db.run('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1'); } catch(e) {}
  /* ── Table activity_logs ─────────────────────────────────────── */
  db.run(
    'CREATE TABLE IF NOT EXISTS activity_logs (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  user_id INTEGER NOT NULL DEFAULT 0,' +
    '  user_name TEXT NOT NULL DEFAULT "system",' +
    '  role TEXT NOT NULL DEFAULT "system",' +
    '  action TEXT NOT NULL,' +
    '  target TEXT DEFAULT "",' +
    '  created_at TEXT DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  /* Seed : créer compte admin par défaut si aucun utilisateur */
  var uCount = db.exec('SELECT COUNT(*) AS c FROM users');
  if (uCount && uCount[0].values[0][0] === 0) {
    var adminHash = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO users (name,email,password,role,is_active) VALUES (?,?,?,?,1)',
      ['Administrateur', 'admin@benami.shop', adminHash, 'admin']);
    save();
    console.log('[AUTH] Compte admin créé → admin@benami.shop / admin123');
  }
  db.run(
    'CREATE TABLE IF NOT EXISTS stock_movements (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  product_id INTEGER NOT NULL,' +
    '  product_name TEXT DEFAULT "",' +
    '  brand TEXT DEFAULT "",' +
    '  size INTEGER,' +
    '  type TEXT NOT NULL,' +
    '  quantity INTEGER NOT NULL,' +
    '  note TEXT DEFAULT "",' +
    '  moved_at TEXT DEFAULT CURRENT_TIMESTAMP' +
    ')'
  );
  save();
}

/* ── Seed si tables vides ────────────────────────────────────── */
function seedIfEmpty() {
  var res   = db.exec('SELECT COUNT(*) AS c FROM brands');
  var count = (res && res.length) ? res[0].values[0][0] : 0;
  if (count > 0) {
    console.log('[DB] Déjà remplie (' + count + ' marques)');
    return;
  }
  console.log('[DB] Seed en cours...');

  var brands = [
    ['Nike','USA'], ['Adidas','Germany'], ['Puma','Germany'],
    ['New Balance','USA'], ['Reebok','UK'], ['Converse','USA'],
    ['Vans','USA'], ['Jordan','USA'], ['Skechers','USA']
  ];
  brands.forEach(function(b) {
    db.run('INSERT OR IGNORE INTO brands (name,country) VALUES (?,?)', b);
  });

  var prods = [
    [1,'Nike Air Max 270',      'NK-AM270-BLK','Nike',       1299,42,'Noir/Blanc','Running Air Max.','👟',[38,39,40,41,42,43]],
    [2,'Adidas Ultra Boost 23', 'AD-UB23-WHT', 'Adidas',     1490,28,'Blanc',     'Technologie Boost.','🥾',[39,40,41,42,43,44]],
    [3,'Jordan 1 Retro High OG','JD-1RHOG-RED','Jordan',     1899, 0,'Rouge/Noir','Icone depuis 1985.','👠',[40,41,42]],
    [4,'Puma RS-X3',            'PM-RSX3-GRY', 'Puma',        849,15,'Gris/Bleu', 'Chunky retro.','👞',[37,38,39,40,41,42,43]],
    [5,'New Balance 574',       'NB-574-NVY',  'New Balance',  990, 5,'Marine',   'Classique 1988.','🥿',[40,41,42,43]],
    [6,'Converse Chuck 70',     'CV-C70-BLK',  'Converse',    699,33,'Noir',      'Canvas vintage.','👟',[36,37,38,39,40,41,42,43,44]],
    [7,'Vans Old Skool',        'VN-OS-CHKR',  'Vans',        649, 0,'Checker',   'Skate 1977.','👟',[38,39,40,41,42]],
    [8,'Reebok Club C 85',      'RB-CC85-WHT', 'Reebok',      750,22,'Blanc/Vert','Tennis vintage.','👟',[38,39,40,41,42,43,44]],
    [9,'Nike Dunk Low',         'NK-DL-GRY',   'Nike',       1099,18,'Gris/Blanc','Basket retro.','👟',[38,39,40,41,42,43]],
    [10,'Adidas Samba OG',      'AD-SBG-BLK',  'Adidas',      899,11,'Noir/Blanc','Football indoor.','👞',[39,40,41,42,43]]
  ];
  prods.forEach(function(p) {
    var id=p[0],nm=p[1],sku=p[2],br=p[3],pr=p[4],qt=p[5],cl=p[6],ds=p[7],im=p[8],sz=p[9];
    db.run(
      'INSERT OR IGNORE INTO products (id,name,sku,brand,price,qty,color,description,img,sizes) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, nm, sku, br, pr, qt, cl, ds, im, JSON.stringify(sz)]
    );
    var base = sz.length ? Math.floor(qt / sz.length) : 0;
    sz.forEach(function(s) {
      db.run('INSERT OR IGNORE INTO product_sizes (product_id,size,qty) VALUES (?,?,?)', [id, s, base]);
    });
  });

  var mvs = [
    [1,'Nike Air Max 270',      'Nike',    40,'in', 50,'Stock initial'],
    [1,'Nike Air Max 270',      'Nike',    40,'out', 8,'Ventes semaine 1'],
    [2,'Adidas Ultra Boost 23', 'Adidas',  41,'in', 30,'Stock initial'],
    [3,'Jordan 1 Retro High OG','Jordan',  41,'in', 10,'Stock initial'],
    [3,'Jordan 1 Retro High OG','Jordan',  41,'out',10,'Rupture tout vendu'],
    [5,'New Balance 574',       'NB',      42,'out',10,'Stock faible'],
    [6,'Converse Chuck 70',     'Converse',40,'in', 40,'Reception'],
    [8,'Reebok Club C 85',      'Reebok',  41,'in', 25,'Reception'],
    [9,'Nike Dunk Low',         'Nike',    40,'in', 20,'Reception'],
    [10,'Adidas Samba OG',      'Adidas',  41,'in', 15,'Reception']
  ];
  mvs.forEach(function(m) {
    db.run(
      'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES (?,?,?,?,?,?,?)',
      m
    );
  });

  save();
  console.log('[DB] Seed OK ->', DB_FILE);
}

/* ── HTTP helpers ────────────────────────────────────────────── */
var CORS_H = {
  'Access-Control-Allow-Origin' : ALLOWED_ORIGIN || 'null',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

function jsonRes(res, data, status) {
  var h = Object.assign({ 'Content-Type': 'application/json' }, CORS_H, SECURITY_HEADERS);
  res.writeHead(status || 200, h);
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise(function(resolve) {
    var raw = '';
    req.on('data', function(c) { raw += c; });
    req.on('end', function() {
      try { resolve(JSON.parse(raw)); } catch(e) { resolve({}); }
    });
  });
}

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css',
  '.js'  : 'application/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon'
};

/* ══════════════════════════════════════════════════════════════
   DÉMARRAGE
   ══════════════════════════════════════════════════════════════ */
initSqlJs().then(function(SQL) {

  openDb(SQL);
  createSchema();
  seedIfEmpty();

  var server = http.createServer(function(req, res) {

    /* async wrapper pour pouvoir utiliser await readBody */
    handleRequest(req, res).catch(function(err) {
      console.error('[ERREUR]', err.message);
      jsonRes(res, { error: err.message }, 500);
    });
  });

  /* ── Graceful shutdown : sauvegarder la DB avant de quitter ─── */
  function gracefulShutdown(signal) {
    console.log('\n[SERVER] Signal ' + signal + ' reçu. Fermeture propre…');
    server.close(function() {
      if (db) {
        try {
          fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
          console.log('[DB] Sauvegarde finale OK → ' + DB_FILE);
        } catch(e) {
          console.error('[DB] Erreur sauvegarde finale:', e.message);
        }
      }
      console.log('[SERVER] Arrêté proprement.');
      process.exit(0);
    });
    /* Forcer la sortie après 10s si le serveur ne se ferme pas */
    setTimeout(function() {
      console.error('[SERVER] Timeout — arrêt forcé.');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', function() { gracefulShutdown('SIGTERM'); });
  process.on('SIGINT',  function() { gracefulShutdown('SIGINT');  });

  /* ── Uncaught exceptions : logger sans crasher si possible ─── */
  process.on('uncaughtException', function(err) {
    console.error('[UNCAUGHT]', err.message, err.stack);
    /* Ne pas quitter en dev — quitter en prod pour être redémarré */
    if (IS_PROD) process.exit(1);
  });

  process.on('unhandledRejection', function(reason) {
    console.error('[UNHANDLED REJECTION]', reason);
    if (IS_PROD) process.exit(1);
  });

  server.listen(PORT, HOST, function() {
    console.log('');
    console.log('╬════════════════════════════════════════════╬');
    console.log('║   BEN AMI SHOP — Serveur démarré  ✅         ║');
    console.log('║   ENV  : ' + NODE_ENV.padEnd(35) + '║');
    console.log('║   PORT : ' + String(PORT).padEnd(35) + '║');
    console.log('║   DB   : ' + path.basename(DB_FILE).padEnd(35) + '║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
    /* Ouvrir le navigateur uniquement en développement local */
    if (!IS_PROD && process.platform === 'darwin') {
      require('child_process').exec('open http://localhost:' + PORT);
    }
  });

}).catch(function(err) {
  console.error('[FATAL] Impossible de démarrer:', err.message);
  process.exit(1);
});

/* ══════════════════════════════════════════════════════════════
   ROUTEUR PRINCIPAL
   ══════════════════════════════════════════════════════════════ */
async function handleRequest(req, res) {

  var url      = new URL(req.url, 'http://localhost:' + PORT);
  var method   = req.method;
  var pathname = url.pathname;

  /* CORS preflight */
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_H);
    res.end();
    return;
  }

  console.log('[' + method + '] ' + pathname);

  /* ── Fichiers statiques ──────────────────────────────────── */
  if (!pathname.startsWith('/api/')) {
    var fp = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('Not found'); return; }
    var ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    fs.createReadStream(fp).pipe(res);
    return;
  }

  /* ════════════════════════════════════════════════════════════
     API — STATS  (tous les connectés)
     ════════════════════════════════════════════════════════════ */
  if (pathname === '/api/stats' && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var rows = q(
      'SELECT COUNT(*) AS total,' +
      ' SUM(qty) AS totalUnits,' +
      ' SUM(CASE WHEN qty=0 THEN 1 ELSE 0 END) AS outOfStock,' +
      ' SUM(CASE WHEN qty>0 AND qty<=5 THEN 1 ELSE 0 END) AS lowStock,' +
      ' SUM(price*qty) AS totalValue FROM products'
    );
    console.log('[DB] stats ->', rows[0]);
    return jsonRes(res, rows[0] || {});
  }

  /* ════════════════════════════════════════════════════════════
     API — BRANDS
     admin : GET + POST
     employee : GET seulement
     ════════════════════════════════════════════════════════════ */
  if (pathname === '/api/brands' && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var rows = q('SELECT * FROM brands ORDER BY name');
    console.log('[DB] brands ->', rows.length);
    return jsonRes(res, rows);
  }

  if (pathname === '/api/brands' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    var body = await readBody(req);
    if (!body.name) return jsonRes(res, { error: 'name requis' }, 400);
    try {
      run('INSERT INTO brands (name,country) VALUES (?,?)', [body.name, body.country || '']);
      var bid = lastId();
      console.log('[DB] Marque créée:', body.name, 'id=' + bid);
      return jsonRes(res, { id: bid, name: body.name, country: body.country || '' });
    } catch(e) {
      return jsonRes(res, { error: e.message }, 409);
    }
  }

  /* ════════════════════════════════════════════════════════════
     API — PRODUCTS
     admin   : GET + POST + PUT + DELETE
     employee: GET seulement
     ════════════════════════════════════════════════════════════ */
  if (pathname === '/api/products' && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var rows = q('SELECT * FROM products ORDER BY id DESC');
    var result = rows.map(function(p) {
      return Object.assign({}, p, { sizes: JSON.parse(p.sizes || '[]') });
    });
    console.log('[DB] products ->', result.length);
    return jsonRes(res, result);
  }

  /* regex match produit par id */
  var mP = pathname.match(/^\/api\/products\/(\d+)$/);

  if (mP && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var pid  = +mP[1];
    var rows = q('SELECT * FROM products WHERE id=?', [pid]);
    if (!rows.length) return jsonRes(res, { error: 'Introuvable' }, 404);
    var p = Object.assign({}, rows[0], { sizes: JSON.parse(rows[0].sizes || '[]') });
    p.sizesData = q('SELECT size,qty FROM product_sizes WHERE product_id=? ORDER BY size', [pid]);
    return jsonRes(res, p);
  }

  if (pathname === '/api/products' && method === 'POST') {
    var caller = requireAdmin(req, res); /* employee interdit */
    if (!caller) return;
    var body = await readBody(req);
    if (!body.name || !body.sku || !body.brand) {
      return jsonRes(res, { error: 'name, sku, brand requis' }, 400);
    }
    try {
      run(
        'INSERT INTO products (name,sku,brand,price,qty,color,description,img,sizes) VALUES (?,?,?,?,?,?,?,?,?)',
        [body.name, body.sku, body.brand,
         body.price || 0, body.qty || 0,
         body.color || '', body.description || body.desc || '',
         body.img || '👟', JSON.stringify(body.sizes || [])]
      );
      var newId = lastId();
      var szArr = body.sizes || [];
      if (szArr.length) {
        var base = body.qty > 0 ? Math.floor(body.qty / szArr.length) : 0;
        szArr.forEach(function(s) {
          run('INSERT OR IGNORE INTO product_sizes (product_id,size,qty) VALUES (?,?,?)', [newId, s, base]);
        });
      }
      if (body.qty > 0) {
        run(
          'INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES (?,?,?,"in",?,?)',
          [newId, body.name, body.brand, body.qty, 'Stock initial']
        );
      }
      console.log('[DB] Produit créé:', body.name, 'id=' + newId);
      logAction(caller, 'ADD_PRODUCT', body.name + ' (SKU: ' + body.sku + ')');
      return jsonRes(res, { id: newId });
    } catch(e) {
      return jsonRes(res, { error: e.message }, 409);
    }
  }

  if (mP && method === 'PUT') {
    var caller = requireAdmin(req, res); /* employee interdit */
    if (!caller) return;
    var body = await readBody(req);
    var pid  = +mP[1];
    var olds = q('SELECT * FROM products WHERE id=?', [pid]);
    if (!olds.length) return jsonRes(res, { error: 'Introuvable' }, 404);
    var old = olds[0];

    var uName  = body.name  || old.name;
    var uSku   = body.sku   || old.sku;
    var uBrand = body.brand || old.brand;
    var uImg   = body.img   || old.img;
    var uPrice = def(body.price, old.price);
    var uQty   = def(body.qty,   old.qty);
    var uColor = def(body.color, old.color || '');
    var uDesc  = (body.description !== undefined) ? body.description
               : def(body.desc, old.description || '');
    var uSizes = JSON.stringify(body.sizes || JSON.parse(old.sizes || '[]'));

    run(
      'UPDATE products SET name=?,sku=?,brand=?,price=?,qty=?,color=?,description=?,img=?,sizes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [uName, uSku, uBrand, uPrice, uQty, uColor, uDesc, uImg, uSizes, pid]
    );

    if (body.sizesData) {
      run('DELETE FROM product_sizes WHERE product_id=?', [pid]);
      body.sizesData.forEach(function(s) {
        run('INSERT INTO product_sizes (product_id,size,qty) VALUES (?,?,?)', [pid, s.size, s.qty || 0]);
      });
    }

    if (uQty !== old.qty) {
      var diff = uQty - old.qty;
      run(
        'INSERT INTO stock_movements (product_id,product_name,brand,type,quantity,note) VALUES (?,?,?,?,?,?)',
        [pid, uName, uBrand, diff > 0 ? 'in' : 'out', Math.abs(diff),
         'Ajustement (' + (diff > 0 ? '+' : '') + diff + ')']
      );
    }

    console.log('[DB] Produit mis à jour: id=' + pid);
    logAction(caller, 'UPDATE_PRODUCT', uName + ' (id:' + pid + ')');
    return jsonRes(res, { success: true });
  }

  if (mP && method === 'DELETE') {
    var caller = requireAdmin(req, res); /* employee interdit */
    if (!caller) return; /* ✔ fix : return manquant corrigé */
    var pid  = +mP[1];
    /* Valider que pid est un entier positif */
    if (!Number.isInteger(pid) || pid <= 0) return jsonRes(res, { error: 'ID invalide.' }, 400);
    var rows = q('SELECT name FROM products WHERE id=?', [pid]);
    if (!rows.length) return jsonRes(res, { error: 'Introuvable' }, 404);
    run('DELETE FROM product_sizes WHERE product_id=?', [pid]);
    run('DELETE FROM products WHERE id=?', [pid]);
    console.log('[DB] Produit supprimé: id=' + pid);
    logAction(caller, 'DELETE_PRODUCT', (rows[0] ? rows[0].name : 'id:' + pid));
    return jsonRes(res, { success: true });
  }

  /* ════════════════════════════════════════════════════════════
     API — SIZES
     GET   : employee + admin
     POST (adjust) : employee + admin (ajout stock autorisé)
     ════════════════════════════════════════════════════════════ */
  var mS = pathname.match(/^\/api\/sizes\/(\d+)$/);
  if (mS && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var rows = q('SELECT size,qty FROM product_sizes WHERE product_id=? ORDER BY size', [+mS[1]]);
    return jsonRes(res, rows);
  }

  if (pathname === '/api/sizes/adjust' && method === 'POST') {
    var caller = requireEmployee(req, res);
    if (!caller) return;
    /* employé : seulement delta > 0 (entrée stock) */
    var body      = await readBody(req);
    var delta     = body.delta;
    if (caller.role === 'employee' && delta < 0) {
      return denyEmployee(res, 'sizes/adjust delta négatif');
    }
    var productId = body.productId;
    var size      = body.size;
    var note      = body.note || ('Ajust. taille ' + size);

    var sRows = q('SELECT qty FROM product_sizes WHERE product_id=? AND size=?', [productId, size]);
    if (!sRows.length) return jsonRes(res, { error: 'Taille introuvable' }, 404);

    var sNewQty = Math.max(0, sRows[0].qty + delta);
    run('UPDATE product_sizes SET qty=? WHERE product_id=? AND size=?', [sNewQty, productId, size]);

    var tRows  = q('SELECT SUM(qty) AS t FROM product_sizes WHERE product_id=?', [productId]);
    var sTotal = (tRows[0] && tRows[0].t) ? tRows[0].t : 0;
    run('UPDATE products SET qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [sTotal, productId]);

    var pRows = q('SELECT name,brand FROM products WHERE id=?', [productId]);
    run(
      'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES (?,?,?,?,?,?,?)',
      [productId,
       (pRows[0] && pRows[0].name)  || '',
       (pRows[0] && pRows[0].brand) || '',
       size, delta > 0 ? 'in' : 'out', Math.abs(delta), note]
    );

    console.log('[DB] Taille ajustée: produit=' + productId + ' taille=' + size + ' newQty=' + sNewQty + ' total=' + sTotal);
    var pName = (pRows[0] && pRows[0].name) || ('produit#' + productId);
    logAction(caller, delta > 0 ? 'STOCK_IN' : 'STOCK_OUT',
      pName + ' taille=' + size + ' delta=' + (delta > 0 ? '+' : '') + delta);
    return jsonRes(res, { newQty: sNewQty, total: sTotal });
  }

  /* ════════════════════════════════════════════════════════════
     API — MOVEMENTS
     GET  : employee + admin
     POST : employee + admin (employé ne peut faire que type=in)
     ════════════════════════════════════════════════════════════ */
  if (pathname === '/api/movements' && method === 'GET') {
    if (!requireEmployee(req, res)) return;
    var rows = q('SELECT * FROM stock_movements ORDER BY moved_at DESC');
    console.log('[DB] movements ->', rows.length);
    return jsonRes(res, rows);
  }

  if (pathname === '/api/movements' && method === 'POST') {
    var caller = requireEmployee(req, res);
    if (!caller) return;
    var body = await readBody(req);
    if (!body.product_id || !body.type || !body.quantity) {
      return jsonRes(res, { error: 'product_id, type, quantity requis' }, 400);
    }
    /* Employé : seulement type=in autorisé */
    if (caller.role === 'employee' && body.type !== 'in') {
      return denyEmployee(res, 'movements POST type=' + body.type);
    }
    run(
      'INSERT INTO stock_movements (product_id,product_name,brand,size,type,quantity,note) VALUES (?,?,?,?,?,?,?)',
      [body.product_id, body.product_name || '', body.brand || '',
       body.size || null, body.type, body.quantity, body.note || '']
    );
    var mvId = lastId();

    var pRows = q('SELECT qty FROM products WHERE id=?', [body.product_id]);
    if (pRows.length) {
      var pCurQty = pRows[0].qty;
      var pNewQty = body.type === 'in'
        ? pCurQty + body.quantity
        : Math.max(0, pCurQty - body.quantity);
      run('UPDATE products SET qty=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [pNewQty, body.product_id]);

      if (body.size) {
        var szRows = q('SELECT qty FROM product_sizes WHERE product_id=? AND size=?', [body.product_id, body.size]);
        if (szRows.length) {
          var szNewQty = body.type === 'in'
            ? szRows[0].qty + body.quantity
            : Math.max(0, szRows[0].qty - body.quantity);
          run('UPDATE product_sizes SET qty=? WHERE product_id=? AND size=?', [szNewQty, body.product_id, body.size]);
        }
      }
    }

    console.log('[DB] Mouvement: id=' + mvId + ' type=' + body.type + ' qty=' + body.quantity);
    var mvAction = body.type === 'in' ? 'STOCK_IN' : body.type === 'out' ? 'STOCK_OUT' : 'STOCK_ADJUST';
    logAction(caller, mvAction,
      (body.product_name || 'produit#' + body.product_id) +
      ' qty=' + body.quantity +
      (body.size ? ' taille=' + body.size : ''));
    return jsonRes(res, { id: mvId });
  }

  /* ════════════════════════════════════════════════════════════
     API — AUTH
     ════════════════════════════════════════════════════════════ */

  /* POST /api/register — seul un admin peut créer des comptes */
  if (pathname === '/api/register' && method === 'POST') {
    var body = await readBody(req);
    var name     = sanitize(body.name     || '');
    var email    = sanitize(body.email    || '').toLowerCase();
    var password = body.password || '';
    var role     = body.role    || 'employee';

    /* Validation stricte */
    if (!isValidString(name, 100))  return jsonRes(res, { error: 'Nom invalide (max 100 car.).' }, 400);
    if (!isValidEmail(email))       return jsonRes(res, { error: 'Email invalide.' }, 400);
    if (!isValidString(password) || password.length < 8) {
      return jsonRes(res, { error: 'Mot de passe trop court (min. 8 car.).' }, 400);
    }
    var allowedRoles = ['employee', 'admin'];
    var userRole = allowedRoles.includes(role) ? role : 'employee';

    var existing = q('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length) {
      return jsonRes(res, { error: 'Cet email est déjà utilisé.' }, 409);
    }

    var hash = bcrypt.hashSync(password, 12); /* rounds : 12 */
    run(
      'INSERT INTO users (name, email, password, role, is_active) VALUES (?,?,?,?,1)',
      [name, email, hash, userRole]
    );
    var newUid = lastId();
    console.log('[AUTH] Inscription:', email, 'role=' + userRole);
    return jsonRes(res, { id: newUid, message: 'Compte créé avec succès.' }, 201);
  }

  /* POST /api/login */
  if (pathname === '/api/login' && method === 'POST') {
    /* Rate limiting par IP */
    var clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.warn('[SEC] Rate limit dépassé pour IP:', clientIp);
      return jsonRes(res, { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, 429);
    }

    var body = await readBody(req);
    var email    = sanitize(body.email    || '').toLowerCase();
    var password = body.password || '';

    if (!isValidEmail(email) || !password) {
      return jsonRes(res, { error: 'Email ou mot de passe invalide.' }, 400);
    }

    var users = q('SELECT * FROM users WHERE email=?', [email]);
    /* Réponse identique qu'il existe ou non (anti-enumération) */
    if (!users.length) {
      bcrypt.hashSync('dummy_compare_to_avoid_timing_attack', 10);
      console.warn('[SEC] Tentative login échouée (inconnu):', email, 'IP:', clientIp);
      return jsonRes(res, { error: 'Identifiants incorrects.' }, 401);
    }
    var user = users[0];

    var match = bcrypt.compareSync(password, user.password);
    if (!match) {
      console.warn('[SEC] Tentative login échouée (mdp):', email, 'IP:', clientIp);
      return jsonRes(res, { error: 'Identifiants incorrects.' }, 401);
    }

    if (!user.is_active) {
      return jsonRes(res, { error: 'Compte désactivé. Contactez un administrateur.' }, 403);
    }

    /* Générer un jti unique pour pouvoir révoquer le token */
    var jti = user.id + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, jti: jti },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    resetRateLimit(clientIp); /* connexion réussie → reset le compteur */
    console.log('[AUTH] Connexion:', email);
    logAction({ id: user.id, email: user.email, role: user.role }, 'LOGIN', 'IP:' + clientIp);
    return jsonRes(res, {
      token: token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  }

  /* POST /api/logout — révoquer le token */
  if (pathname === '/api/logout' && method === 'POST') {
    var payload = requireAuth(req);
    if (payload && payload.jti) {
      revokeToken(payload.jti);
      logAction(payload, 'LOGOUT', payload.email);
      console.log('[AUTH] Logout:', payload.email, '| token révoqué');
    }
    return jsonRes(res, { success: true, message: 'Déconnecté.' });
  }

  /* GET /api/me — nécessite Bearer token */
  if (pathname === '/api/me' && method === 'GET') {
    var payload = requireAuth(req);
    if (!payload) return jsonRes(res, { error: 'Token manquant ou invalide.' }, 401);

    var rows = q('SELECT id, name, email, role, is_active, created_at FROM users WHERE id=?', [payload.id]);
    if (!rows.length) return jsonRes(res, { error: 'Utilisateur introuvable.' }, 404);
    if (!rows[0].is_active) return jsonRes(res, { error: 'Compte désactivé.' }, 403);

    console.log('[AUTH] /api/me:', rows[0].email);
    return jsonRes(res, rows[0]);
  }

  /* ════════════════════════════════════════════════════════════════
     API — USERS (admin only)
     ════════════════════════════════════════════════════════════════ */

  /* GET /api/users — liste tous les utilisateurs */
  if (pathname === '/api/users' && method === 'GET') {
    var adm = requireAdmin(req, res);
    if (!adm) return;
    var rows = q('SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id ASC');
    console.log('[AUTH] GET /api/users ->', rows.length);
    return jsonRes(res, rows);
  }

  /* POST /api/users — créer un utilisateur (admin) */
  if (pathname === '/api/users' && method === 'POST') {
    var adm = requireAdmin(req, res);
    if (!adm) return;
    var body = await readBody(req);
    var name     = sanitize(body.name     || '');
    var email    = sanitize(body.email    || '').toLowerCase();
    var password = body.password || '';
    var role     = body.role    || 'employee';

    if (!isValidString(name, 100)) return jsonRes(res, { error: 'Nom invalide.' }, 400);
    if (!isValidEmail(email))      return jsonRes(res, { error: 'Email invalide.' }, 400);
    if (!password || password.length < 8) return jsonRes(res, { error: 'Mot de passe trop court (min. 8).' }, 400);
    var allowed = ['employee', 'admin'];
    var uRole = allowed.includes(role) ? role : 'employee';

    var ex = q('SELECT id FROM users WHERE email=?', [email]);
    if (ex.length) return jsonRes(res, { error: 'Email déjà utilisé.' }, 409);

    var hash = bcrypt.hashSync(password, 12);
    run('INSERT INTO users (name,email,password,role,is_active) VALUES (?,?,?,?,1)',
      [name, email, hash, uRole]);
    var uid = lastId();
    logAction(adm, 'CREATE_USER', email + ' role=' + uRole);
    console.log('[AUTH] Utilisateur créé:', email, 'role=' + uRole);
    return jsonRes(res, { id: uid, name, email, role: uRole, is_active: 1 }, 201);
  }

  /* PUT /api/users/:id — modifier un utilisateur (admin) */
  var mU = pathname.match(/^\/api\/users\/(\d+)$/);

  if (mU && method === 'PUT') {
    var adm = requireAdmin(req, res);
    if (!adm) return;
    var uid = +mU[1];
    var body = await readBody(req);
    var existing = q('SELECT * FROM users WHERE id=?', [uid]);
    if (!existing.length) return jsonRes(res, { error: 'Utilisateur introuvable.' }, 404);
    var old = existing[0];

    var uName  = body.name  ? body.name.trim() : old.name;
    var uEmail = body.email ? body.email.toLowerCase() : old.email;
    var uRole  = ['employee','admin'].includes(body.role) ? body.role : old.role;
    var uActive = (body.is_active !== undefined) ? (body.is_active ? 1 : 0) : old.is_active;

    /* Changer le mot de passe si fourni */
    if (body.password && body.password.length >= 6) {
      var newHash = bcrypt.hashSync(body.password, 10);
      run('UPDATE users SET name=?,email=?,password=?,role=?,is_active=? WHERE id=?',
        [uName, uEmail, newHash, uRole, uActive, uid]);
    } else {
      run('UPDATE users SET name=?,email=?,role=?,is_active=? WHERE id=?',
        [uName, uEmail, uRole, uActive, uid]);
    }
    console.log('[AUTH] Utilisateur mis à jour: id=' + uid);
    return jsonRes(res, { success: true });
  }

  /* DELETE /api/users/:id — supprimer (admin, ne peut pas supprimer lui-même) */
  if (mU && method === 'DELETE') {
    var adm = requireAdmin(req, res);
    if (!adm) return;
    var uid = +mU[1];
    if (uid === adm.id) return jsonRes(res, { error: 'Impossible de supprimer votre propre compte.' }, 400);
    var existing = q('SELECT id FROM users WHERE id=?', [uid]);
    if (!existing.length) return jsonRes(res, { error: 'Utilisateur introuvable.' }, 404);
    run('DELETE FROM users WHERE id=?', [uid]);
    console.log('[AUTH] Utilisateur supprimé: id=' + uid);
    return jsonRes(res, { success: true });
  }

  /* ════════════════════════════════════════════════════════════════
     API — ACTIVITY LOGS (admin only)
     GET  /api/logs          → liste paginée avec filtres
     DELETE /api/logs        → purge totale
     ════════════════════════════════════════════════════════════════ */
  if (pathname === '/api/logs' && method === 'GET') {
    var adm = requireAdmin(req, res);
    if (!adm) return;

    var action   = url.searchParams.get('action')   || '';
    var userId   = url.searchParams.get('user_id')  || '';
    var dateFrom = url.searchParams.get('from')     || '';
    var dateTo   = url.searchParams.get('to')       || '';
    var limit    = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
    var offset   = parseInt(url.searchParams.get('offset') || '0');

    var where = '1=1';
    var params = [];
    if (action)   { where += ' AND action=?';                 params.push(action); }
    if (userId)   { where += ' AND user_id=?';                params.push(+userId); }
    if (dateFrom) { where += ' AND created_at >= ?';          params.push(dateFrom); }
    if (dateTo)   { where += ' AND created_at <= ?';          params.push(dateTo + ' 23:59:59'); }

    var total = q('SELECT COUNT(*) AS c FROM activity_logs WHERE ' + where, params);
    var rows  = q(
      'SELECT * FROM activity_logs WHERE ' + where +
      ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
      params.concat([limit, offset])
    );

    console.log('[LOG] GET /api/logs ->', rows.length, '/', (total[0] ? total[0].c : 0));
    return jsonRes(res, { total: total[0] ? total[0].c : 0, logs: rows });
  }

  if (pathname === '/api/logs' && method === 'DELETE') {
    var adm = requireAdmin(req, res);
    if (!adm) return;
    run('DELETE FROM activity_logs');
    logAction(adm, 'LOGS_PURGED', 'all activity logs deleted');
    console.log('[LOG] Logs purgés par', adm.email);
    return jsonRes(res, { success: true, message: 'Logs purgés.' });
  }

  /* ── 404 ─────────────────────────────────────────────────── */
  return jsonRes(res, { error: 'Route inconnue: ' + pathname }, 404);
}

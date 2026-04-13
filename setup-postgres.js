/**
 * setup-postgres.js
 * Crée la base de données benami_shop dans PostgreSQL.
 *
 * Usage : node setup-postgres.js
 *
 * Lit DATABASE_URL depuis .env pour construire la connexion admin.
 * Doit être exécuté UNE SEULE FOIS avant le premier démarrage du serveur.
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var { Client } = require('pg');

/* ── Chargement .env ─────────────────────────────────────────── */
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
  }
} catch(e) {}

var dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[SETUP] ❌ DATABASE_URL manquant dans .env');
  process.exit(1);
}

/* Extrait le nom de la base cible depuis l'URL */
var dbName = dbUrl.split('/').pop().split('?')[0];
/* Remplace le nom de base par "postgres" pour la connexion admin */
var adminUrl = dbUrl.replace(/\/[^/]+(\?.*)?$/, '/postgres');

var client = new Client({ connectionString: adminUrl });

async function main() {
  await client.connect();
  console.log('[SETUP] ✅ Connexion PostgreSQL OK (admin)');

  var res = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
  if (res.rowCount > 0) {
    console.log('[SETUP] ✅ Base "' + dbName + '" existe déjà — rien à faire.');
  } else {
    /* CREATE DATABASE ne supporte pas les paramètres liés */
    await client.query('CREATE DATABASE "' + dbName + '" ENCODING \'UTF8\'');
    console.log('[SETUP] ✅ Base "' + dbName + '" créée avec succès !');
  }

  await client.end();
  console.log('[SETUP] Terminé. Lancez maintenant: npm start');
}

main().catch(function(err) {
  console.error('[SETUP] ❌ Erreur:', err.message);
  process.exit(1);
});

-- ================================================================
-- BEN AMI SHOP — DBeaver Connection & Query Guide
-- DB: /Users/mohamedredabouchaiba/Desktop/Ben Ami/benami_shop.db
-- Engine: SQLite 3.43.2
-- ================================================================
--
-- HOW TO CONNECT IN DBEAVER:
--   1. Open DBeaver
--   2. Database menu → New Database Connection
--   3. Choose SQLite → Next
--   4. Path: click Browse → select:
--      /Users/mohamedredabouchaiba/Desktop/Ben Ami/benami_shop.db
--   5. Test Connection → Finish
--
-- ================================================================

-- ── SCHEMA ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brands (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  country    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  sku         TEXT NOT NULL UNIQUE,
  brand_id    INTEGER NOT NULL REFERENCES brands(id),
  price       REAL NOT NULL DEFAULT 0,
  qty         INTEGER NOT NULL DEFAULT 0,
  color       TEXT,
  description TEXT,
  img_emoji   TEXT DEFAULT '👟',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_sizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       INTEGER NOT NULL,
  qty        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(product_id, size)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       INTEGER,
  type       TEXT NOT NULL CHECK(type IN ('in','out','adjust')),
  quantity   INTEGER NOT NULL,
  note       TEXT,
  moved_at   TEXT DEFAULT (datetime('now'))
);

-- ── VIEWS ────────────────────────────────────────────────────────

CREATE VIEW IF NOT EXISTS v_products_full AS
SELECT p.id, p.name, p.sku, b.name AS brand, p.price, p.qty,
  p.color, p.description, p.img_emoji,
  CASE WHEN p.qty=0 THEN 'rupture' WHEN p.qty<=5 THEN 'faible' ELSE 'ok' END AS stock_status,
  p.created_at, p.updated_at
FROM products p JOIN brands b ON b.id = p.brand_id;

CREATE VIEW IF NOT EXISTS v_stock_by_size AS
SELECT p.name AS product_name, p.sku, b.name AS brand, ps.size, ps.qty AS qty_per_size,
  CASE WHEN ps.qty=0 THEN 'rupture' WHEN ps.qty<=2 THEN 'faible' ELSE 'ok' END AS size_status
FROM product_sizes ps
JOIN products p ON p.id = ps.product_id
JOIN brands b   ON b.id = p.brand_id
ORDER BY p.name, ps.size;

CREATE VIEW IF NOT EXISTS v_dashboard_stats AS
SELECT COUNT(*) AS total_products, SUM(qty) AS total_units,
  SUM(CASE WHEN qty=0 THEN 1 ELSE 0 END)        AS out_of_stock,
  SUM(CASE WHEN qty>0 AND qty<=5 THEN 1 ELSE 0 END) AS low_stock,
  SUM(price * qty)                               AS total_inventory_value
FROM products;

CREATE VIEW IF NOT EXISTS v_brand_stock AS
SELECT b.name AS brand, COUNT(p.id) AS nb_products,
  SUM(p.qty) AS total_units, SUM(p.price*p.qty) AS total_value
FROM brands b LEFT JOIN products p ON p.brand_id = b.id
GROUP BY b.id, b.name ORDER BY total_units DESC;

-- ================================================================
-- USEFUL QUERIES — paste these in DBeaver SQL Editor
-- ================================================================

-- 1. Dashboard overview
SELECT * FROM v_dashboard_stats;

-- 2. All products with brand and stock status
SELECT * FROM v_products_full;

-- 3. Products in rupture
SELECT name, sku, brand, qty FROM v_products_full WHERE stock_status = 'rupture';

-- 4. Low stock alerts (qty <= 5)
SELECT name, sku, brand, qty FROM v_products_full WHERE stock_status IN ('rupture','faible') ORDER BY qty;

-- 5. Stock by size — all products
SELECT * FROM v_stock_by_size;

-- 6. Brand performance
SELECT * FROM v_brand_stock ORDER BY total_value DESC;

-- 7. Movement history
SELECT sm.id, p.name AS product, b.name AS brand,
  sm.size, sm.type, sm.quantity, sm.note, sm.moved_at
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
JOIN brands b   ON b.id = p.brand_id
ORDER BY sm.moved_at DESC;

-- 8. Total stock value by brand
SELECT b.name, SUM(p.price * p.qty) AS valeur_stock, COUNT(p.id) AS nb_produits
FROM brands b JOIN products p ON p.brand_id = b.id
GROUP BY b.id ORDER BY valeur_stock DESC;

-- 9. Most stocked products
SELECT name, brand, qty, price, (price*qty) AS valeur
FROM v_products_full ORDER BY qty DESC LIMIT 10;

-- 10. Sizes with rupture
SELECT * FROM v_stock_by_size WHERE size_status = 'rupture';

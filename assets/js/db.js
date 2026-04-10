/* ================================================================
   BEN AMI SHOP — db.js  v4
   Data Layer DUAL-MODE :
     MODE API    → lit/écrit dans benami_shop.db via server.js
     MODE OFFLINE → localStorage (fallback si serveur absent)

   Le mode est détecté automatiquement au démarrage.
   Console logs : [DB-API] ou [DB-LOCAL] selon le mode actif.
   ================================================================ */

const DB = (() => {

  /* ── CONFIGURATION ────────────────────────────────────────────── */
  /* URL relative : fonctionne en local ET en production (Render, etc.) */
  const API_BASE  = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://' + window.location.host + '/api'
    : window.location.origin + '/api';
  const API_TIMEOUT = 2000; // ms avant de basculer en mode offline

  /* ── ÉTAT ─────────────────────────────────────────────────────── */
  let _mode    = 'offline'; // 'api' | 'offline'
  let _ready   = false;
  let _onReady = [];

  /* ── STORAGE KEYS (mode offline) ─────────────────────────────── */
  const KEYS = {
    products:  'ba_products',
    movements: 'ba_movements',
    sizes:     'ba_sizes',
    brands:    'ba_brands',
    nextMvId:  'ba_next_mv_id',
    seeded:    'ba_seeded_v4',
  };

  /* ── SEED DATA (snapshot de benami_shop.db) ───────────────────── */
  const SEED_BRANDS = [
    { id:1, name:'Nike',        country:'USA' },
    { id:2, name:'Adidas',      country:'Germany' },
    { id:3, name:'Puma',        country:'Germany' },
    { id:4, name:'New Balance', country:'USA' },
    { id:5, name:'Reebok',      country:'UK' },
    { id:6, name:'Converse',    country:'USA' },
    { id:7, name:'Vans',        country:'USA' },
    { id:8, name:'Jordan',      country:'USA' },
    { id:9, name:'Skechers',    country:'USA' },
  ];

  const SEED_PRODUCTS = [
    { id:1,  name:'Nike Air Max 270',       sku:'NK-AM270-BLK',  brand:'Nike',        price:1299, qty:42, color:'Noir/Blanc', desc:'Running lifestyle avec amorti visible Air Max.',         img:'👟', sizes:[38,39,40,41,42,43] },
    { id:2,  name:'Adidas Ultra Boost 23',  sku:'AD-UB23-WHT',   brand:'Adidas',      price:1490, qty:28, color:'Blanc',      desc:'Performance et confort premium technologie Boost.',      img:'🥾', sizes:[39,40,41,42,43,44] },
    { id:3,  name:'Jordan 1 Retro High OG', sku:'JD-1RHOG-RED',  brand:'Jordan',      price:1899, qty:0,  color:'Rouge/Noir', desc:"Icone basketball et streetwear depuis 1985.",            img:'👠', sizes:[40,41,42] },
    { id:4,  name:'Puma RS-X3',             sku:'PM-RSX3-GRY',   brand:'Puma',        price:849,  qty:15, color:'Gris/Bleu',  desc:'Chunky runner au design retro-futuriste.',              img:'👞', sizes:[37,38,39,40,41,42,43] },
    { id:5,  name:'New Balance 574',        sku:'NB-574-NVY',    brand:'New Balance', price:990,  qty:5,  color:'Marine',     desc:'Classique lifestyle toutes occasions depuis 1988.',     img:'🥿', sizes:[40,41,42,43] },
    { id:6,  name:'Converse Chuck 70',      sku:'CV-C70-BLK',    brand:'Converse',    price:699,  qty:33, color:'Noir',       desc:'Toile canvas vintage avec construction premium.',       img:'👟', sizes:[36,37,38,39,40,41,42,43,44] },
    { id:7,  name:'Vans Old Skool',         sku:'VN-OS-CHKR',    brand:'Vans',        price:649,  qty:0,  color:'Checker',    desc:"Skate icon indémodable né en 1977.",                   img:'👟', sizes:[38,39,40,41,42] },
    { id:8,  name:'Reebok Club C 85',       sku:'RB-CC85-WHT',   brand:'Reebok',      price:750,  qty:22, color:'Blanc/Vert', desc:'Tennis vintage clean au style minimaliste.',           img:'👟', sizes:[38,39,40,41,42,43,44] },
    { id:9,  name:'Nike Dunk Low',          sku:'NK-DL-GRY',     brand:'Nike',        price:1099, qty:18, color:'Gris/Blanc', desc:'Basket retro devenu icone lifestyle.',                 img:'👟', sizes:[38,39,40,41,42,43] },
    { id:10, name:'Adidas Samba OG',        sku:'AD-SBG-BLK',    brand:'Adidas',      price:899,  qty:11, color:'Noir/Blanc', desc:'Football indoor devenu must-have mode.',               img:'👞', sizes:[39,40,41,42,43] },
  ];

  const SEED_SIZES = {
    1:[{size:38,qty:7},{size:39,qty:7},{size:40,qty:7},{size:41,qty:7},{size:42,qty:7},{size:43,qty:7}],
    2:[{size:39,qty:5},{size:40,qty:5},{size:41,qty:5},{size:42,qty:5},{size:43,qty:4},{size:44,qty:4}],
    3:[{size:40,qty:0},{size:41,qty:0},{size:42,qty:0}],
    4:[{size:37,qty:3},{size:38,qty:2},{size:39,qty:2},{size:40,qty:2},{size:41,qty:2},{size:42,qty:2},{size:43,qty:2}],
    5:[{size:40,qty:2},{size:41,qty:1},{size:42,qty:1},{size:43,qty:1}],
    6:[{size:36,qty:4},{size:37,qty:4},{size:38,qty:4},{size:39,qty:4},{size:40,qty:4},{size:41,qty:4},{size:42,qty:3},{size:43,qty:3},{size:44,qty:3}],
    7:[{size:38,qty:0},{size:39,qty:0},{size:40,qty:0},{size:41,qty:0},{size:42,qty:0}],
    8:[{size:38,qty:4},{size:39,qty:3},{size:40,qty:3},{size:41,qty:3},{size:42,qty:3},{size:43,qty:3},{size:44,qty:3}],
    9:[{size:38,qty:3},{size:39,qty:3},{size:40,qty:3},{size:41,qty:3},{size:42,qty:3},{size:43,qty:3}],
    10:[{size:39,qty:3},{size:40,qty:2},{size:41,qty:2},{size:42,qty:2},{size:43,qty:2}],
  };

  const SEED_MOVEMENTS = [
    {id:1,  product_id:1, product_name:'Nike Air Max 270',       brand:'Nike',    size:40, type:'in',  quantity:50, note:'Reception commande fournisseur', moved_at:'2026-04-08 18:40'},
    {id:2,  product_id:1, product_name:'Nike Air Max 270',       brand:'Nike',    size:40, type:'out', quantity:8,  note:'Ventes semaine 1',               moved_at:'2026-04-08 18:41'},
    {id:3,  product_id:2, product_name:'Adidas Ultra Boost 23',  brand:'Adidas',  size:41, type:'in',  quantity:30, note:'Reception commande',             moved_at:'2026-04-08 18:42'},
    {id:4,  product_id:3, product_name:'Jordan 1 Retro High OG', brand:'Jordan',  size:41, type:'in',  quantity:10, note:'Reception stock initial',        moved_at:'2026-04-08 18:43'},
    {id:5,  product_id:3, product_name:'Jordan 1 Retro High OG', brand:'Jordan',  size:41, type:'out', quantity:10, note:'Rupture tout vendu',             moved_at:'2026-04-08 18:44'},
    {id:6,  product_id:5, product_name:'New Balance 574',        brand:'NB',      size:42, type:'out', quantity:10, note:'Stock faible',                   moved_at:'2026-04-08 18:45'},
    {id:7,  product_id:6, product_name:'Converse Chuck 70',      brand:'Converse',size:40, type:'in',  quantity:40, note:'Reception',                      moved_at:'2026-04-08 18:46'},
    {id:8,  product_id:8, product_name:'Reebok Club C 85',       brand:'Reebok',  size:41, type:'in',  quantity:25, note:'Reception',                      moved_at:'2026-04-08 18:47'},
    {id:9,  product_id:9, product_name:'Nike Dunk Low',          brand:'Nike',    size:40, type:'in',  quantity:20, note:'Reception',                      moved_at:'2026-04-08 18:48'},
    {id:10, product_id:10,product_name:'Adidas Samba OG',        brand:'Adidas',  size:41, type:'in',  quantity:15, note:'Reception',                      moved_at:'2026-04-08 18:49'},
  ];

  /* ── HELPERS LOCALSTORAGE ─────────────────────────────────────── */
  const load    = (k) => JSON.parse(localStorage.getItem(k) || '[]');
  const loadObj = (k) => JSON.parse(localStorage.getItem(k) || '{}');
  const persist = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* ── DÉTECTION MODE (API vs OFFLINE) ─────────────────────────── */
  function detectMode() {
    return new Promise((resolve) => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), API_TIMEOUT);

      fetch(`${API_BASE}/stats`, { signal: controller.signal })
        .then(r => {
          clearTimeout(t);
          if (r.ok) {
            _mode = 'api';
            console.log('%c[DB-API] ✅ Connecté à benami_shop.db via serveur Node.js', 'color:#22c55e;font-weight:bold');
            console.log('%c[DB-API] → DBeaver verra les vraies données en temps réel', 'color:#22c55e');
          } else {
            throw new Error('API non disponible');
          }
        })
        .catch(() => {
          clearTimeout(t);
          _mode = 'offline';
          console.warn('%c[DB-LOCAL] ⚠️ Serveur Node.js non détecté — mode localStorage activé', 'color:#eab308;font-weight:bold');
          console.warn('%c[DB-LOCAL] → Lancez "node server.js" pour synchroniser avec SQLite', 'color:#eab308');
          initLocalStorage();
        })
        .finally(() => {
          _ready = true;
          _onReady.forEach(fn => fn(_mode));
          _onReady = [];
          resolve(_mode);
          // Afficher badge mode dans la page
          showModeBadge();
        });
    });
  }

  function showModeBadge() {
    const badge = document.createElement('div');
    badge.id = 'db-mode-badge';
    badge.style.cssText = `
      position:fixed;bottom:14px;left:14px;z-index:9999;
      display:flex;align-items:center;gap:7px;
      padding:6px 12px;border-radius:999px;font-size:11px;font-weight:600;
      font-family:'DM Sans',sans-serif;cursor:default;
      box-shadow:0 2px 12px rgba(0,0,0,0.4);
      ${_mode === 'api'
        ? 'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.4);color:#22c55e'
        : 'background:rgba(234,179,8,0.15);border:1px solid rgba(234,179,8,0.4);color:#eab308'}
    `;
    badge.innerHTML = _mode === 'api'
      ? '<span style="width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block;box-shadow:0 0 6px #22c55e"></span> SQLite · DBeaver sync'
      : '<span style="width:7px;height:7px;border-radius:50%;background:#eab308;display:inline-block"></span> localStorage · offline';
    badge.title = _mode === 'api'
      ? 'Données synchronisées avec benami_shop.db — visibles dans DBeaver'
      : 'Mode hors-ligne : lancez "node server.js" pour activer la base SQLite';
    document.body.appendChild(badge);
  }

  /* ── INIT LOCALSTORAGE (mode offline) ─────────────────────────── */
  function initLocalStorage() {
    if (!localStorage.getItem(KEYS.seeded)) {
      console.log('[DB-LOCAL] Seed des données initiales dans localStorage...');
      persist(KEYS.products,  SEED_PRODUCTS);
      persist(KEYS.movements, SEED_MOVEMENTS);
      persist(KEYS.brands,    SEED_BRANDS);
      persist(KEYS.sizes,     SEED_SIZES);
      persist(KEYS.nextMvId, '21');
      persist(KEYS.seeded,   'v4');
      console.log('[DB-LOCAL] ✅ Données seed insérées');
    }
  }

  /* ── API FETCH HELPERS ────────────────────────────────────────── */
  async function apiFetch(path, opts = {}) {
    try {
      const r = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) {
        console.error(`[DB-API] ❌ ${opts.method||'GET'} ${path} →`, data.error);
        throw new Error(data.error || 'API error');
      }
      return data;
    } catch (e) {
      console.error(`[DB-API] ❌ Erreur réseau:`, e.message);
      throw e;
    }
  }

  /* ════════════════════════════════════════════════════════════════
     MODULE: brands
     ════════════════════════════════════════════════════════════════ */
  const brands = {
    getAll() {
      if (_mode === 'api') {
        // Sync call: fetch async data then return — pages use async patterns
        console.warn('[DB] brands.getAll() en mode API nécessite await — utilisez DB.brands.getAllAsync()');
      }
      return load(KEYS.brands);
    },

    async getAllAsync() {
      if (_mode === 'api') {
        const data = await apiFetch('/brands');
        console.log(`[DB-API] ✅ brands.getAllAsync → ${data.length} marques`);
        return data;
      }
      return load(KEYS.brands);
    },

    getNames: () => load(KEYS.brands).map(b => b.name),

    add(name, country = '') {
      if (_mode === 'api') {
        apiFetch('/brands', { method: 'POST', body: { name, country } })
          .then(r => console.log(`[DB-API] ✅ Marque ajoutée: ${name} (id=${r.id})`))
          .catch(e => console.error('[DB-API] ❌ Erreur ajout marque:', e));
        // Optimistic local update
        const list = load(KEYS.brands);
        const id   = list.length ? Math.max(...list.map(b=>b.id))+1 : 1;
        list.push({ id, name, country });
        persist(KEYS.brands, list);
        return id;
      }
      const list = load(KEYS.brands);
      const id   = list.length ? Math.max(...list.map(b=>b.id))+1 : 1;
      list.push({ id, name, country });
      persist(KEYS.brands, list);
      console.log(`[DB-LOCAL] ✅ Marque ajoutée: ${name} (id=${id})`);
      return id;
    },
  };

  /* ════════════════════════════════════════════════════════════════
     MODULE: products
     ════════════════════════════════════════════════════════════════ */
  const products = {

    getAll() {
      return load(KEYS.products);
    },

    async getAllAsync() {
      if (_mode === 'api') {
        const data = await apiFetch('/products');
        // Sync to localStorage for sync methods
        persist(KEYS.products, data);
        console.log(`[DB-API] ✅ products.getAllAsync → ${data.length} produits`);
        return data;
      }
      return load(KEYS.products);
    },

    getById(id) {
      return load(KEYS.products).find(p => p.id === +id) || null;
    },

    async getByIdAsync(id) {
      if (_mode === 'api') {
        const data = await apiFetch(`/products/${id}`);
        return data;
      }
      return load(KEYS.products).find(p => p.id === +id) || null;
    },

    add(data) {
      const list = load(KEYS.products);
      const id   = list.length ? Math.max(...list.map(p=>p.id))+1 : 1;
      const newProduct = { id, ...data, created_at: new Date().toISOString() };
      list.unshift(newProduct);
      persist(KEYS.products, list);

      if (_mode === 'api') {
        apiFetch('/products', { method: 'POST', body: { ...data, id } })
          .then(r => console.log(`[DB-API] ✅ Produit créé en SQLite: ${data.name} (id=${r.id})`))
          .catch(e => console.error('[DB-API] ❌ Erreur création produit SQLite:', e.message));
      }
      console.log(`[DB-${_mode==='api'?'API':'LOCAL'}] ✅ Produit ajouté: ${data.name} (id=${id})`);
      return id;
    },

    update(id, data) {
      const list = load(KEYS.products);
      const idx  = list.findIndex(p => p.id === +id);
      if (idx === -1) { console.error(`[DB] ❌ Produit id=${id} introuvable`); return false; }
      list[idx] = { ...list[idx], ...data, id: +id, updated_at: new Date().toISOString() };
      persist(KEYS.products, list);

      if (_mode === 'api') {
        apiFetch(`/products/${id}`, { method: 'PUT', body: data })
          .then(() => console.log(`[DB-API] ✅ Produit mis à jour en SQLite: id=${id}`))
          .catch(e => console.error('[DB-API] ❌ Erreur mise à jour produit SQLite:', e.message));
      }
      console.log(`[DB-${_mode==='api'?'API':'LOCAL'}] ✅ Produit mis à jour: id=${id}`);
      return true;
    },

    delete(id) {
      let list = load(KEYS.products);
      const p  = list.find(pr => pr.id === +id);
      list = list.filter(pr => pr.id !== +id);
      persist(KEYS.products, list);
      // Remove sizes
      const sz = loadObj(KEYS.sizes);
      delete sz[id]; persist(KEYS.sizes, sz);

      if (_mode === 'api') {
        apiFetch(`/products/${id}`, { method: 'DELETE' })
          .then(() => console.log(`[DB-API] ✅ Produit supprimé de SQLite: id=${id}`))
          .catch(e => console.error('[DB-API] ❌ Erreur suppression SQLite:', e.message));
      }
      console.log(`[DB-${_mode==='api'?'API':'LOCAL'}] ✅ Produit supprimé: ${p?.name} (id=${id})`);
    },

    skuExists(sku, excludeId = null) {
      return load(KEYS.products).some(p => p.sku === sku && p.id !== +excludeId);
    },

    getStats() {
      const list = load(KEYS.products);
      const stats = {
        total:      list.length,
        totalUnits: list.reduce((s,p) => s + (p.qty||0), 0),
        outOfStock: list.filter(p => p.qty === 0).length,
        lowStock:   list.filter(p => p.qty > 0 && p.qty <= 5).length,
        totalValue: list.reduce((s,p) => s + (p.price||0) * (p.qty||0), 0),
      };
      console.log(`[DB] getStats():`, stats);
      return stats;
    },

    getByBrand() {
      const map = {};
      load(KEYS.products).forEach(p => { map[p.brand] = (map[p.brand]||0) + (p.qty||0); });
      return map;
    },
  };

  /* ════════════════════════════════════════════════════════════════
     MODULE: sizes
     ════════════════════════════════════════════════════════════════ */
  const sizes = {

    getForProduct(id) {
      const all = loadObj(KEYS.sizes);
      return all[id] || [];
    },

    async getForProductAsync(id) {
      if (_mode === 'api') {
        const data = await apiFetch(`/sizes/${id}`);
        // Sync locally
        const all = loadObj(KEYS.sizes);
        all[id] = data;
        persist(KEYS.sizes, all);
        return data;
      }
      return loadObj(KEYS.sizes)[id] || [];
    },

    setForProduct(id, arr) {
      const all = loadObj(KEYS.sizes);
      all[id] = arr;
      persist(KEYS.sizes, all);
    },

    adjustQty(productId, size, delta) {
      const all  = loadObj(KEYS.sizes);
      const list = all[productId] || [];
      const item = list.find(s => s.size === +size);
      if (!item) { console.error(`[DB] ❌ Taille ${size} introuvable pour produit ${productId}`); return 0; }
      item.qty = Math.max(0, item.qty + delta);
      all[productId] = list;
      persist(KEYS.sizes, all);
      const newTotal = list.reduce((sum, s) => sum + s.qty, 0);
      products.update(productId, { qty: newTotal });

      if (_mode === 'api') {
        apiFetch('/sizes/adjust', { method: 'POST', body: { productId, size: +size, delta, note: `Ajust. rapide taille ${size}` } })
          .then(r => console.log(`[DB-API] ✅ Taille ajustée SQLite: taille ${size}, newQty=${r.newQty}, total=${r.total}`))
          .catch(e => console.error('[DB-API] ❌ Erreur ajustement taille:', e.message));
      }
      console.log(`[DB-${_mode==='api'?'API':'LOCAL'}] ✅ Taille ${size} ajustée: delta=${delta>0?'+':''}${delta}, newQty=${item.qty}, total=${newTotal}`);
      return newTotal;
    },

    initForProduct(productId, sizeList, totalQty) {
      const n    = sizeList.length;
      const base = n ? Math.floor(totalQty / n) : 0;
      const rem  = n ? totalQty % n : 0;
      const arr  = sizeList.map((s, i) => ({ size: s, qty: base + (i < rem ? 1 : 0) }));
      const all  = loadObj(KEYS.sizes);
      all[productId] = arr;
      persist(KEYS.sizes, all);
      console.log(`[DB] ✅ Tailles initialisées pour produit ${productId}:`, arr);
    },
  };

  /* ════════════════════════════════════════════════════════════════
     MODULE: movements
     ════════════════════════════════════════════════════════════════ */
  const movements = {

    getAll() {
      return load(KEYS.movements);
    },

    async getAllAsync() {
      if (_mode === 'api') {
        const data = await apiFetch('/movements');
        persist(KEYS.movements, data);
        console.log(`[DB-API] ✅ movements.getAllAsync → ${data.length} mouvements`);
        return data;
      }
      return load(KEYS.movements);
    },

    add(data) {
      const list = load(KEYS.movements);
      const id   = parseInt(localStorage.getItem(KEYS.nextMvId) || '21');
      const mv   = {
        id,
        product_id:   data.product_id,
        product_name: data.product_name || '',
        brand:        data.brand || '',
        size:         data.size || null,
        type:         data.type,
        quantity:     data.quantity,
        note:         data.note || '',
        moved_at:     new Date().toISOString().slice(0,16).replace('T',' '),
      };
      list.unshift(mv);
      persist(KEYS.movements, list);
      localStorage.setItem(KEYS.nextMvId, String(id + 1));

      if (_mode === 'api') {
        apiFetch('/movements', { method: 'POST', body: mv })
          .then(r => console.log(`[DB-API] ✅ Mouvement enregistré en SQLite: id=${r.id} type=${mv.type} qty=${mv.quantity}`))
          .catch(e => console.error('[DB-API] ❌ Erreur mouvement SQLite:', e.message));
      }
      console.log(`[DB-${_mode==='api'?'API':'LOCAL'}] ✅ Mouvement enregistré: type=${mv.type} qty=${mv.quantity} produit="${mv.product_name}"`);
      return id;
    },

    apply(productId, sizeNum, type, qty, note, productName) {
      const p = products.getById(productId);
      if (!p) { console.error(`[DB] ❌ Produit ${productId} introuvable pour mouvement`); return null; }

      if (type === 'in') {
        products.update(productId, { qty: (p.qty||0) + qty });
        if (sizeNum) {
          const szList = sizes.getForProduct(productId);
          const s = szList.find(x => x.size === +sizeNum);
          if (s) { s.qty += qty; sizes.setForProduct(productId, szList); }
        }
      } else if (type === 'out') {
        products.update(productId, { qty: Math.max(0, (p.qty||0) - qty) });
        if (sizeNum) {
          const szList = sizes.getForProduct(productId);
          const s = szList.find(x => x.size === +sizeNum);
          if (s) { s.qty = Math.max(0, s.qty - qty); sizes.setForProduct(productId, szList); }
        }
      }
      return movements.add({ product_id: productId, size: sizeNum||null, type, quantity: qty, note, product_name: productName||p.name, brand: p.brand||'' });
    },
  };

  /* ════════════════════════════════════════════════════════════════
     HELPERS
     ════════════════════════════════════════════════════════════════ */
  const helpers = {
    stockStatus: (qty) => qty === 0 ? 'out' : qty <= 5 ? 'low' : 'ok',
    stockLabel:  (st)  => ({ ok:'En stock', low:'Stock faible', out:'Rupture' })[st] || '',
    mvIcon:      (t)   => ({ in:'fa-arrow-down', out:'fa-arrow-up', adjust:'fa-arrows-alt-v' })[t] || 'fa-circle',
    mvLabel:     (t)   => ({ in:'Entrée', out:'Sortie', adjust:'Ajustement' })[t] || t,
    formatDate:  (d)   => d ? String(d).slice(0,16) : '—',

    thumbHTML(p, cls='product-thumb') {
      if (typeof p.img === 'string' && p.img.startsWith('data:'))
        return `<div class="${cls}"><img src="${p.img}" alt="${p.name}"></div>`;
      return `<div class="${cls}">${p.img || '👟'}</div>`;
    },
  };

  /* ════════════════════════════════════════════════════════════════
     INIT & RESET
     ════════════════════════════════════════════════════════════════ */
  function init() {
    return detectMode();
  }

  function onReady(fn) {
    if (_ready) fn(_mode); else _onReady.push(fn);
  }

  function getMode() { return _mode; }

  function reset() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    initLocalStorage();
    console.log('[DB] ✅ Données réinitialisées depuis le seed');
  }

  /* ── API publique ─────────────────────────────────────────────── */
  return { init, onReady, getMode, reset, brands, products, sizes, movements, helpers };

})();

/* ── Auto-init sur chaque page ────────────────────────────────── */
DB.init().then(mode => {
  console.log(`[DB] Mode actif: ${mode === 'api' ? '🟢 API SQLite (DBeaver sync)' : '🟡 localStorage (offline)'}`);
});

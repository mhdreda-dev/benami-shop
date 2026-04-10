/* ================================================================
   BEN AMI SHOP — app.js  v3
   Shared UI: Drawer, Toast, Modal, SizeBuilder,
   ImageUpload, Charts, Pagination, AlertStrip, Confirm.
   ================================================================ */

/* ================================================================
   AUTH GUARD — redirige vers login si pas de token
   ================================================================ */
function authGuard() {
  const token = localStorage.getItem('token');
  const page  = location.pathname.split('/').pop() || 'index.html';
  const publicPages = ['login.html', 'register.html'];
  if (!token && !publicPages.includes(page)) {
    window.location.href = '/login.html';
    return null;
  }
  return JSON.parse(localStorage.getItem('user') || 'null');
}

function logout() {
  var token = localStorage.getItem('token');
  /* Révoquer le token côté serveur (fire-and-forget) */
  if (token) {
    fetch('/api/logout', {
      method : 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    }).catch(function() {}); /* silencieux si hors-ligne */
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

/* ================================================================
   RBAC — contrôle d'accès basé sur les rôles
   ================================================================ */
const Auth = {
  getUser()  { return JSON.parse(localStorage.getItem('user') || 'null'); },
  getToken() { return localStorage.getItem('token') || ''; },
  isAdmin()  { const u = this.getUser(); return u && u.role === 'admin'; },
  isEmployee(){ const u = this.getUser(); return u && (u.role === 'employee' || u.role === 'admin'); },

  /* Cache les éléments [data-role="admin"] si l'user n'est pas admin */
  applyRoles() {
    const isAdm = this.isAdmin();
    document.querySelectorAll('[data-role="admin"]').forEach(el => {
      el.style.display = isAdm ? '' : 'none';
    });
    document.querySelectorAll('[data-role="employee"]').forEach(el => {
      el.style.display = this.isEmployee() ? '' : 'none';
    });
    /* data-role="admin-only" : cacher ET désactiver le bouton */
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      if (!isAdm) {
        el.style.display = 'none';
        el.disabled = true;
      }
    });
  },

  /* headers pour fetch avec token */
  headers() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.getToken()
    };
  },

  /* fetch avec auth auto */
  async fetch(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: { ...this.headers(), ...(opts.headers || {}) } });
    if (res.status === 401) { logout(); return null; }
    return res;
  }
};

window.Auth = Auth;

/* ================================================================
   DRAWER — sidebar on desktop, sliding panel on mobile
   ================================================================ */
const Drawer = {
    open() {
        document.getElementById('sidebar')?.classList.add('open');
        document.getElementById('drawer-backdrop')?.classList.add('visible');
        document.body.classList.add('drawer-open');
        // Update toggle icon
        const ico = document.querySelector('.mobile-toggle i, .topbar-toggle-btn i');
        if (ico) ico.className = 'fas fa-times';
    },

    close() {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('drawer-backdrop')?.classList.remove('visible');
        document.body.classList.remove('drawer-open');
        // Restore toggle icon
        const ico = document.querySelector('.mobile-toggle i, .topbar-toggle-btn i');
        if (ico) ico.className = 'fas fa-bars';
    },

  toggle() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
          sidebar.classList.contains('open') ? this.close() : this.open();
        } else {
          // Desktop: toggle sidebar-hidden on body
          document.body.classList.toggle('sidebar-hidden');
          const collapseBtn = document.querySelector('.sidebar-collapse-btn i');
          if (collapseBtn) {
            collapseBtn.className = document.body.classList.contains('sidebar-hidden')
              ? 'fas fa-chevron-right'
              : 'fas fa-chevron-left';
          }
        }
    },

  setActive() {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  updateBadges() {
    const stats   = DB.products.getStats();
    const mvCount = DB.movements.getAll().length;
    const set     = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('badge-products',  DB.products.getAll().length);
    set('badge-movements', mvCount);
    set('badge-alerts',    stats.outOfStock);
    set('badge-brands',    DB.brands.getAll().length);
    const dot = document.getElementById('notif-dot');
    if (dot) dot.style.display = stats.outOfStock > 0 ? 'block' : 'none';
  },

  _injectBackdrop() {
    if (document.getElementById('drawer-backdrop')) return;
    const bd = document.createElement('div');
    bd.id        = 'drawer-backdrop';
    bd.className = 'drawer-backdrop';
    bd.addEventListener('click', () => this.close());
    document.body.appendChild(bd);
  },

  _bindSwipe() {
    let startX = 0;
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    sb.addEventListener('touchend',   e => {
      if (e.changedTouches[0].clientX - startX < -60) this.close();
    }, { passive: true });
  },

  init() {
    this._injectBackdrop();
    this._bindSwipe();
  },
};

/* backward compat */
const Sidebar = Drawer;

/* ====================a============================================
   TOAST
   ================================================================ */
const Toast = {
  _c: null,
  _box() {
    if (!this._c) {
      this._c = document.getElementById('toast-container');
      if (!this._c) {
        this._c = document.createElement('div');
        this._c.id = 'toast-container';
        this._c.className = 'toast-container';
        document.body.appendChild(this._c);
      }
    }
    return this._c;
  },
  show(msg, type = 'success', ms = 3400) {
    const ic = { success:'fa-check-circle s', error:'fa-times-circle e', info:'fa-info-circle i', warning:'fa-exclamation-triangle w' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${ic[type]||ic.success}"></i><span>${msg}</span>`;
    el.addEventListener('click', () => el.remove());
    this._box().appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; setTimeout(()=>el.remove(),300); }, ms);
  },
  success: m => Toast.show(m,'success'),
  error:   m => Toast.show(m,'error'),
  info:    m => Toast.show(m,'info'),
  warning: m => Toast.show(m,'warning'),
};

/* ================================================================
   MODAL
   ================================================================ */
const Modal = {
  _stack: [],
  open(id)  { const el=document.getElementById(id); if(!el)return; el.classList.add('open'); this._stack.push(id); document.body.style.overflow='hidden'; },
  close(id) { const el=document.getElementById(id); if(!el)return; el.classList.remove('open'); this._stack=this._stack.filter(x=>x!==id); if(!this._stack.length) document.body.style.overflow=''; },
  closeTop(){ if(this._stack.length) this.close(this._stack[this._stack.length-1]); },
  bindBackdrop(id){ const el=document.getElementById(id); if(el) el.addEventListener('click',e=>{if(e.target===el)this.close(id);}); },
};
document.addEventListener('keydown', e => { if(e.key==='Escape') Modal.closeTop(); });

/* ================================================================
   SIZE BUILDER
   ================================================================ */
const SizeBuilder = {
  ALL_SIZES: [35,36,37,38,39,40,41,42,43,44,45,46],
  render(cid, sel=[]) {
    const c = document.getElementById(cid); if(!c) return;
    c.innerHTML = '';
    this.ALL_SIZES.forEach(s => {
      const b = document.createElement('button');
      b.type='button'; b.textContent=s;
      b.className='size-toggle'+(sel.includes(s)?' selected':'');
      b.addEventListener('click', ()=>b.classList.toggle('selected'));
      c.appendChild(b);
    });
  },
  getSelected(cid) {
    return [...document.querySelectorAll(`#${cid} .size-toggle.selected`)].map(b=>parseInt(b.textContent));
  },
};

/* ================================================================
   IMAGE UPLOAD
   ================================================================ */
const ImageUpload = {
  bind(inputId, previewId) {
    let data = null;
    const inp = document.getElementById(inputId);
    const prv = document.getElementById(previewId);
    if (!inp || !prv) return ()=>null;
    inp.addEventListener('change', e => {
      const f = e.target.files[0]; if(!f) return;
      const r = new FileReader();
      r.onload = ev => {
        data = ev.target.result;
        prv.innerHTML = `<div class="preview-box"><img src="${data}" alt=""><div class="preview-remove" onclick="this.closest('.preview-box').remove()">×</div></div>`;
      };
      r.readAsDataURL(f);
    });
    return () => data;
  },
};

/* ================================================================
   CHARTS
   ================================================================ */
const Charts = {
  _i: {},
  PAL: ['#f97316','#3b82f6','#22c55e','#eab308','#a855f7','#ec4899','#06b6d4','#f43f5e','#84cc16'],
  _destroy(id){ if(this._i[id]){this._i[id].destroy();delete this._i[id];} },

  renderBrandChart(id) {
    this._destroy(id);
    const bm=DB.products.getByBrand(), labels=Object.keys(bm), data=Object.values(bm);
    this._i[id]=new Chart(document.getElementById(id),{
      type:'doughnut',
      data:{labels,datasets:[{data,backgroundColor:this.PAL.slice(0,labels.length),borderWidth:2,borderColor:'#101010'}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:'#666',font:{family:"'DM Sans'",size:12},padding:14,boxWidth:10}}}},
    });
  },

  renderStockChart(id, limit=8) {
    this._destroy(id);
    const prods=DB.products.getAll().sort((a,b)=>b.qty-a.qty).slice(0,limit);
    this._i[id]=new Chart(document.getElementById(id),{
      type:'bar',
      data:{
        labels:prods.map(p=>p.name.length>16?p.name.slice(0,14)+'…':p.name),
        datasets:[{data:prods.map(p=>p.qty),backgroundColor:prods.map(p=>p.qty===0?'#ef4444':p.qty<=5?'#eab308':'#f97316'),borderRadius:6,borderSkipped:false}],
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{x:{ticks:{color:'#555',font:{size:11}},grid:{display:false}},y:{ticks:{color:'#555',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}},
    });
  },
};

/* ================================================================
   SHARED RENDER HELPERS
   ================================================================ */
function renderTopProducts(cid, limit=5) {
  const c=document.getElementById(cid); if(!c) return;
  const prods=DB.products.getAll().sort((a,b)=>b.qty-a.qty).slice(0,limit);
  const max=prods[0]?.qty||1;
  c.innerHTML=prods.map((p,i)=>`
    <div class="top-product-item">
      <div class="tp-rank">#${i+1}</div>
      ${DB.helpers.thumbHTML(p,'tp-thumb')}
      <div class="tp-info"><div class="tp-name">${p.name}</div><div class="tp-brand">${p.brand}</div></div>
      <div class="tp-bar"><div class="tp-bar-fill" style="width:${Math.round(p.qty/max*100)}%"></div></div>
      <div class="tp-qty">${p.qty}</div>
    </div>`).join('');
}

function renderAlertStrip(cid) {
  const c=document.getElementById(cid); if(!c) return;
  const s=DB.products.getStats(); let h='';
  if(s.outOfStock>0) h+=`<a href="products.html?filter=out" class="alert-pill danger"><i class="fas fa-exclamation-circle"></i>${s.outOfStock} rupture${s.outOfStock>1?'s':''}</a>`;
  if(s.lowStock>0)   h+=`<a href="products.html?filter=low" class="alert-pill warning"><i class="fas fa-exclamation-triangle"></i>${s.lowStock} stock${s.lowStock>1?'s':''} faible${s.lowStock>1?'s':''}</a>`;
  if(!s.outOfStock&&!s.lowStock) h=`<div class="alert-pill success"><i class="fas fa-check-circle"></i>Tous les stocks sont en bon état</div>`;
  c.innerHTML=h;
}

function renderPagination(cid, infoId, total, cur, perPage, onPage) {
  const pages=Math.max(1,Math.ceil(total/perPage));
  const info=document.getElementById(infoId);
  const btns=document.getElementById(cid);
  if(info) info.textContent=`${total} produit${total!==1?'s':''}`;
  if(!btns) return;
  btns.innerHTML='';
  for(let i=1;i<=pages;i++){
    const b=document.createElement('button');
    b.className='page-btn'+(i===cur?' active':'');
    b.textContent=i;
    b.addEventListener('click',()=>onPage(i));
    btns.appendChild(b);
  }
}

function initGlobalSearch(){
  const inp=document.getElementById('global-search'); if(!inp) return;
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&inp.value.trim())
      window.location.href=`products.html?search=${encodeURIComponent(inp.value.trim())}`;
  });
}

/* ================================================================
   CONFIRM
   ================================================================ */
const Confirm = {
  _r: null,
  show(msg) {
    return new Promise(resolve=>{
      this._r=resolve;
      const el=document.getElementById('confirm-modal');
      const tx=el?.querySelector('.confirm-text');
      if(tx) tx.textContent=msg;
      Modal.open('confirm-modal');
    });
  },
  yes(){ Modal.close('confirm-modal'); if(this._r){this._r(true); this._r=null;} },
  no() { Modal.close('confirm-modal'); if(this._r){this._r(false);this._r=null;} },
};

/* ================================================================
   SIDEBAR HTML — adapté au rôle de l'utilisateur
   ================================================================ */
function getSidebarHTML() {
  const stats=DB.products.getStats(), mv=DB.movements.getAll().length;
  const pc=DB.products.getAll().length, bc=DB.brands.getAll().length;
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = user && user.role === 'admin';

  /* Nav commune aux deux rôles */
  const commonNav = `
    <div class="nav-section-label">Principal</div>
    <a href="index.html" class="nav-item" data-page="index.html"><i class="fas fa-chart-pie"></i><span>Dashboard</span></a>
    <a href="products.html" class="nav-item" data-page="products.html"><i class="fas fa-box-open"></i><span>Produits</span><span class="nav-badge orange" id="badge-products">${pc}</span></a>

    <div class="nav-section-label">Stock</div>
    <a href="stock.html" class="nav-item" data-page="stock.html"><i class="fas fa-layer-group"></i><span>Gestion stock</span></a>
    <a href="movements.html" class="nav-item" data-page="movements.html"><i class="fas fa-exchange-alt"></i><span>Mouvements</span><span class="nav-badge orange" id="badge-movements">${mv}</span></a>`;

  /* Nav exclusive admin */
  const adminNav = `
    <div class="nav-section-label">Catalogue</div>
    <a href="add-product.html" class="nav-item" data-page="add-product.html"><i class="fas fa-plus-circle"></i><span>Ajouter produit</span></a>
    <a href="brands.html" class="nav-item" data-page="brands.html"><i class="fas fa-tags"></i><span>Marques</span><span class="nav-badge orange" id="badge-brands">${bc}</span></a>
    <a href="reports.html" class="nav-item" data-page="reports.html"><i class="fas fa-chart-bar"></i><span>Rapports</span></a>

    <div class="nav-section-label">Alertes</div>
    <a href="products.html?filter=out" class="nav-item" data-page=""><i class="fas fa-exclamation-triangle"></i><span>Ruptures</span><span class="nav-badge red" id="badge-alerts">${stats.outOfStock}</span></a>

    <div class="nav-section-label">Administration</div>
    <a href="users.html" class="nav-item" data-page="users.html"><i class="fas fa-users-cog"></i><span>Utilisateurs</span></a>
    <a href="logs.html"  class="nav-item" data-page="logs.html"><i class="fas fa-history"></i><span>Activity Logs</span></a>`;

  /* Nav exclusive employé */
  const employeeNav = `
    <div class="nav-section-label">Catalogue</div>
    <a href="brands.html" class="nav-item" data-page="brands.html"><i class="fas fa-tags"></i><span>Marques</span></a>

    <div class="nav-section-label">Alertes</div>
    <a href="products.html?filter=out" class="nav-item" data-page=""><i class="fas fa-exclamation-triangle"></i><span>Ruptures</span><span class="nav-badge red" id="badge-alerts">${stats.outOfStock}</span></a>`;

  /* Badge rôle dans le footer */
  const roleColor = isAdmin ? '#5b21b6' : '#c2410c';
  const roleBg    = isAdmin ? 'rgba(91,33,182,.15)' : 'rgba(194,65,12,.15)';
  const roleIcon  = isAdmin ? 'fa-shield-alt' : 'fa-hard-hat';
  const roleLabel = isAdmin ? 'Administrateur' : 'Employé';

  return `
    <div class="sidebar-logo">
      <div class="logo-icon"><i class="fas fa-shoe-prints"></i></div>
      <div class="logo-texts">
        <span class="logo-text-main">Ben Ami Shop</span>
        <span class="logo-text-sub">Stock Manager</span>
      </div>
      <button class="sidebar-collapse-btn" onclick="Drawer.toggle()" title="Réduire le menu">
        <i class="fas fa-chevron-left"></i>
      </button>
      <button class="drawer-close-btn" onclick="Drawer.close()" aria-label="Fermer">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <nav class="sidebar-nav">
      ${commonNav}
      ${isAdmin ? adminNav : employeeNav}
    </nav>

    <div class="sidebar-footer">
      <div style="padding:10px 16px 8px;border-top:1px solid var(--border,#252525)">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:${roleBg};border:1px solid ${roleColor}40">
          <i class="fas ${roleIcon}" style="color:${roleColor};font-size:.85rem"></i>
          <div>
            <div style="font-size:.78rem;font-weight:700;color:${roleColor}">${roleLabel}</div>
            <div style="font-size:.68rem;color:var(--text-muted,#808080)">${user ? user.email : ''}</div>
          </div>
        </div>
      </div>
      <div class="db-status"><div class="db-dot"></div><span>SQLite · benami_shop.db</span></div>
    </div>`;
}

/* ================================================================
   TOPBAR HTML — affiche le vrai nom + rôle + déconnexion
   ================================================================ */
function getTopbarHTML(title, subtitle) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const initials = user ? user.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() : 'BA';
  const roleLabel = user ? (user.role === 'admin' ? 'Administrateur' : 'Employé') : '';
  const roleCls   = user && user.role === 'admin' ? 'color:#5b21b6' : 'color:#c2410c';
  return `
    <div class="topbar-left">
      <button class="mobile-toggle" onclick="Drawer.toggle()" aria-label="Menu">
        <i class="fas fa-bars"></i>
      </button>
      <div>
        <div class="page-title">${title}</div>
        <div class="page-breadcrumb">Ben Ami Shop / ${subtitle}</div>
      </div>
    </div>
    <div class="topbar-right">
      <div class="topbar-search">
        <i class="fas fa-search"></i>
        <input type="text" id="global-search" placeholder="Rechercher…" autocomplete="off">
      </div>
      <a href="movements.html" class="icon-btn" title="Notifications">
        <i class="fas fa-bell"></i>
        <span class="notif-dot" id="notif-dot" style="display:none"></span>
      </a>
      <div style="display:flex;align-items:center;gap:.6rem">
        <div style="text-align:right;line-height:1.3">
          <div style="font-size:.85rem;font-weight:700;color:#1a1a2e">${user ? user.name : 'Invité'}</div>
          <div style="font-size:.72rem;font-weight:600;${roleCls}">${roleLabel}</div>
        </div>
        <div class="user-avatar" title="${user ? user.name : ''}" style="cursor:default">${initials}</div>
        <button onclick="logout()" title="Déconnexion"
          style="background:#fee2e2;color:#b91c1c;border:none;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:.85rem;display:flex;align-items:center;justify-content:center">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      </div>
    </div>`;
}

/* ================================================================
   initPage — call once on every page
   ================================================================ */
function initPage(title, subtitle) {
  authGuard(); // redirige si pas connecté

  const sb=document.getElementById('sidebar');
  if(sb) sb.innerHTML=getSidebarHTML();

  const tb=document.getElementById('topbar');
  if(tb) tb.innerHTML=getTopbarHTML(title,subtitle);

  Drawer.setActive();
  Drawer.updateBadges();
  initGlobalSearch();
  Drawer.init();

  /* Appliquer les restrictions RBAC après le rendu du DOM */
  Auth.applyRoles();
}

/* ================================================================
   EXPORTS
   ================================================================ */
window.Drawer=Drawer; window.Sidebar=Drawer;
window.Toast=Toast; window.Modal=Modal; window.Confirm=Confirm;
window.Charts=Charts; window.SizeBuilder=SizeBuilder; window.ImageUpload=ImageUpload;
window.initPage=initPage; window.logout=logout; window.Auth=Auth;
window.renderAlertStrip=renderAlertStrip;
window.renderTopProducts=renderTopProducts;
window.renderPagination=renderPagination;
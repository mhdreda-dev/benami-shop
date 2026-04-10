# 👟 Ben Ami Shop — Guide de déploiement

## 🚀 Démarrage rapide (développement)

```bash
npm install
npm run dev
# → http://localhost:3000
# Compte : admin@benami.shop / admin123
```

---

## 🏭 Déploiement en production

### 1. Préparer les variables d'environnement

```bash
cp .env.example .env
```

Générer un secret JWT sécurisé :

```bash
npm run generate-secret
# Copiez la valeur dans .env → JWT_SECRET=...
```

Remplir `.env` :

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
JWT_SECRET=votre_secret_genere_ici
CORS_ORIGIN=https://votre-domaine.com
DB_PATH=/data/benami_shop.db   # optionnel
```

### 2. Installer les dépendances

```bash
npm install --omit=dev
```

### 3. Démarrer

```bash
npm start
# ou directement :
NODE_ENV=production node server.js
```

### 4. Vérifier que le serveur répond

```bash
npm run health
```

---

## ⚙️ Avec PM2 (process manager recommandé)

```bash
npm install -g pm2

# Démarrer
pm2 start server.js --name benami-shop --env production

# Redémarrage automatique au boot
pm2 startup
pm2 save

# Logs en temps réel
pm2 logs benami-shop

# Statut
pm2 status
```

---

## 🐳 Avec Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t benami-shop .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=votre_secret \
  -e CORS_ORIGIN=https://votre-domaine.com \
  -v $(pwd)/data:/data \
  -e DB_PATH=/data/benami_shop.db \
  --name benami-shop \
  benami-shop
```

---

## 🔒 Checklist sécurité production

- [ ] `JWT_SECRET` défini (min. 48 caractères aléatoires)
- [ ] `NODE_ENV=production` défini
- [ ] `CORS_ORIGIN` restreint à votre domaine
- [ ] `DB_PATH` pointe vers un volume persistant
- [ ] `.env` dans `.gitignore` ✅
- [ ] `*.db` dans `.gitignore` ✅
- [ ] PM2 ou équivalent pour le redémarrage automatique
- [ ] Reverse proxy (nginx) devant le serveur Node.js
- [ ] HTTPS activé (Let's Encrypt)

---

## 📁 Structure

```
benami_shop/
├── server.js          ← Serveur Node.js (API + fichiers statiques)
├── package.json       ← Dépendances + scripts npm
├── .env.example       ← Template de configuration
├── .env               ← Configuration locale (ne pas committer)
├── .gitignore
├── benami_shop.db     ← Base SQLite (ne pas committer)
├── index.html         ← Dashboard (admin/employé dynamique)
├── login.html
├── register.html
├── products.html
├── stock.html
├── movements.html
├── brands.html
├── users.html         ← Admin only
├── logs.html          ← Admin only
└── assets/
    ├── css/style.css
    └── js/
        ├── app.js     ← UI + Auth + RBAC
        └── db.js      ← Data layer
```

## 🌐 Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` ou `production` |
| `PORT` | `3000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface réseau |
| `JWT_SECRET` | *(obligatoire en prod)* | Secret de signature JWT |
| `DB_PATH` | `./benami_shop.db` | Chemin de la base SQLite |
| `CORS_ORIGIN` | `*` en dev, `null` en prod | Origines CORS autorisées |

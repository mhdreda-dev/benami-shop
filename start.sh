#!/bin/bash
# ================================================================
# BEN AMI SHOP — start.sh
# Compatible Node.js v14 → v24+ (sql.js WebAssembly, sans compilation)
# ================================================================

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           BEN AMI SHOP — Démarrage               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js non trouvé. Téléchargez-le sur https://nodejs.org"
    exit 1
fi
echo "✅ Node.js $(node -v) détecté"

# Nettoyer l'ancienne installation ratée de better-sqlite3
if [ -d "node_modules/better-sqlite3" ]; then
    echo "🧹 Nettoyage ancienne dépendance (better-sqlite3)..."
    rm -rf node_modules/better-sqlite3
fi

# Installer sql.js si absent (pure WebAssembly, zéro compilation)
if [ ! -d "node_modules/sql.js" ]; then
    echo "📦 Installation de sql.js..."
    npm install sql.js
    if [ $? -ne 0 ]; then
        echo "❌ Erreur npm install. Essayez : npm install sql.js"
        exit 1
    fi
    echo "✅ sql.js installé"
fi

echo ""
echo "🚀 Démarrage du serveur..."
echo "   → http://localhost:3000"
echo "   → SQLite: benami_shop.db (visible dans DBeaver)"
echo "   → Ctrl+C pour arrêter"
echo ""

node server.js

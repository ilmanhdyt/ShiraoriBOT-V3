#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  install.sh — Setup otomatis ShiraoriBOT dengan baileys-pro
# ═══════════════════════════════════════════════════════════

echo "╔══════════════════════════════════════╗"
echo "║   ShiraoriBOT — Install Dependencies ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Cek Node.js minimal v18
NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 18 ]; then
    echo "❌ Node.js v18+ dibutuhkan! Versi kamu: $(node -v)"
    echo "   Install: https://nodejs.org"
    exit 1
fi
echo "✅ Node.js $(node -v) — OK"

# Install semua dependency
echo ""
echo "📦 Menginstall dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  npm install gagal. Coba:"
    echo "   npm install --legacy-peer-deps"
    npm install --legacy-peer-deps
fi

echo ""
echo "✅ Install selesai!"
echo ""
echo "▶  Jalankan bot:"
echo "   node main.js"
echo ""
echo "   Atau pakai PM2 agar tetap hidup:"
echo "   pm2 start main.js --name ShiraoriBOT"

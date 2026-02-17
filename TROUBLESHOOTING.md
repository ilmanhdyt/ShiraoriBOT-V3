# 🔧 TROUBLESHOOTING GUIDE - NIA-AI Bot

## 🚨 Error Yang Sering Terjadi & Solusinya

---

### ❌ Error 1: "await is only valid in async functions"

**Error Message:**
```
SyntaxError: await is only valid in async functions and the top level bodies of modules
```

**Penyebab:** Top-level await tidak didukung di CommonJS

**Solusi:**
✅ **SUDAH DIPERBAIKI** di file terbaru!

Jika masih error, pastikan pakai file `main.js` yang terbaru dari `nia-ai-upgraded-fixed.zip`

---

### ❌ Error 2: "makeInMemoryStore is not a function"

**Error Message:**
```
TypeError: makeInMemoryStore is not a function
    at Object.<anonymous> (lib/simple.js:30:15)
```

**Penyebab:** Versi Baileys tidak kompatibel atau store sudah deprecated

**Solusi:**
```bash
# Opsi 1: Update package dengan versi kompatibel
npm install @whiskeysockets/baileys@6.7.7 pino@8.21.0 --save

# Opsi 2: Clean install
npm run fix  # atau double-click fix-bot.bat

# Opsi 3: Manual fix
rm -rf node_modules package-lock.json
npm install
```

✅ **SUDAH DIPERBAIKI** di `lib/simple.js` dengan fallback handling!

---

### ❌ Error 3: "Cannot find module 'X'"

**Error Message:**
```
Error: Cannot find module '@whiskeysockets/baileys'
Error: Cannot find module 'pino'
```

**Penyebab:** Dependencies belum terinstall atau corrupt

**Solusi:**
```bash
# Windows: Double-click file ini
fix-bot.bat

# Manual:
npm install

# Jika masih error:
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

---

### ❌ Error 4: "Failed to load ES module"

**Error Message:**
```
Warning: Failed to load the ES module
Make sure to set "type": "module" in package.json
```

**Penyebab:** Conflict antara ESM dan CommonJS

**Solusi:**
✅ **SUDAH DIPERBAIKI!** Package.json sudah set `"type": "commonjs"`

Jika masih muncul:
1. Pastikan package.json ada `"type": "commonjs"`
2. Jangan ubah ke `"type": "module"`

---

### ❌ Error 5: Bot tidak merespon command

**Gejala:**
- Bot connect tapi tidak reply command
- .menu tidak jalan
- .ping tidak respon

**Penyebab & Solusi:**

**1. Prefix salah**
```javascript
// Cek di config.js prefix yang digunakan
global.prefix = /^[./#!]/  // Default: . / # !

// Test dengan prefix berbeda:
.menu
/menu
#menu
!menu
```

**2. Handler error**
```bash
# Cek console, ada error di handler?
# Restart bot:
node .
```

**3. Database error**
```bash
# Hapus database lama:
rm database.json
# Restart bot
```

---

### ❌ Error 6: Session logout / Disconnect

**Gejala:**
- Bot logout sendiri
- DisconnectReason: loggedOut
- Connection closed berulang

**Solusi:**
```bash
# 1. Hapus session lama
rm -rf session
# atau Windows:
rmdir /s session

# 2. Scan/pairing ulang
node index.js --pairing-code

# 3. Jika masih logout, cek:
# - Apakah WhatsApp di HP masih aktif?
# - Apakah ada multi-device lain yang bentrok?
# - Coba unlink semua devices lalu link ulang
```

---

### ❌ Error 7: FFmpeg not found

**Error Message:**
```
⚠️ Please install ffmpeg for sending videos
```

**Solusi Windows:**

**1. Download FFmpeg:**
- https://ffmpeg.org/download.html
- Atau: https://github.com/BtbN/FFmpeg-Builds/releases

**2. Extract & Install:**
```
1. Extract ke C:\ffmpeg
2. Folder structure:
   C:\ffmpeg\
   ├── bin\
   │   ├── ffmpeg.exe
   │   ├── ffprobe.exe
   │   └── ffplay.exe
   └── ...

3. Add to PATH:
   - Windows Key + Pause
   - Advanced System Settings
   - Environment Variables
   - System Variables → Path
   - New → C:\ffmpeg\bin
   - OK semua
   
4. Restart terminal/CMD
5. Test: ffmpeg -version
```

---

### ❌ Error 8: EACCES / Permission denied

**Error Message:**
```
Error: EACCES: permission denied
npm ERR! code EACCES
```

**Solusi:**

**Windows:**
```bash
# Run CMD/PowerShell as Administrator
# Then run:
npm install
```

**Linux/Mac:**
```bash
sudo npm install
# atau
npm install --unsafe-perm
```

---

### ❌ Error 9: Rate limit / API quota exceeded

**Gejala (AI Features):**
- ChatGPT: "quota exceeded"
- Gemini: "RESOURCE_EXHAUSTED"

**Solusi:**

**ChatGPT:**
```bash
# Cek billing di: https://platform.openai.com/account/billing
# Minimal $5 credit diperlukan
# Add payment method jika belum
```

**Gemini:**
```bash
# Free tier: 60 requests/minute
# Tunggu 1 menit lalu coba lagi
# Atau upgrade ke paid plan
```

---

### ❌ Error 10: YouTube/TikTok download gagal

**Gejala:**
- "Failed to download"
- Video tidak terkirim
- Timeout

**Solusi:**

**1. Video terlalu panjang:**
```
YouTube MP3: Max 10 menit
YouTube MP4: Max 5 menit
TikTok: Max 3 menit
```

**2. Video private/restricted:**
```
- Pastikan video public
- Test dengan video lain
- Coba API alternatif (sudah ada fallback di code)
```

**3. API down:**
```bash
# Bot sudah punya fallback API
# Jika semua API down, tunggu beberapa jam
```

---

## 🛠️ AUTOMATIC FIX (Recommended)

Jika bingung dengan error di atas, jalankan automatic fix:

**Windows:**
```
Double-click: fix-bot.bat
```

**Manual:**
```bash
# 1. Clean
rm -rf node_modules package-lock.json

# 2. Reinstall
npm install

# 3. Test
node test.js

# 4. Start bot
node .
```

---

## 📊 Testing Bot Health

Sebelum jalankan bot, test dulu:

```bash
# Run test script
node test.js

# Expected output:
✓ Node.js v18+
✓ All modules found
✓ Baileys imports OK
✓ Config loaded
✓ Library files OK
✅ All tests passed!
```

---

## 🚀 Startup Checklist

Sebelum start bot, pastikan:

- [ ] Node.js v16+ terinstall
- [ ] Dependencies installed (`npm install`)
- [ ] Config.js edited (owner number)
- [ ] FFmpeg installed (optional, untuk media)
- [ ] Test passed (`node test.js`)
- [ ] Session folder kosong (untuk first time)

---

## 🆘 EMERGENCY: Bot Totally Broken?

Jika bot benar-benar rusak:

**1. Start from minimal mode:**
```bash
# Gunakan quick-start untuk test basic functionality
node quick-start.js

# Ini akan bypass semua plugin dan lib/simple.js
# Jika ini jalan, masalah di plugins/simple.js
```

**2. Fresh install:**
```bash
# Download ulang dari nia-ai-upgraded-fixed.zip
# Extract ke folder baru
# npm install
# Edit config
# Run
```

**3. Check node_modules:**
```bash
# Pastikan folder ini ada:
node_modules/@whiskeysockets/baileys/
node_modules/pino/
node_modules/@hapi/boom/

# Jika tidak ada, reinstall:
npm install
```

---

## 📞 Still Having Issues?

**1. Check logs:**
```bash
# Jalankan bot dan screenshot error
# Error biasanya ada di:
# - Console output
# - Debug console
```

**2. Common info needed:**
```
- Node version: node -v
- OS: Windows 10/11?
- Error message: full text
- Last working step
```

**3. Try minimal mode:**
```bash
node quick-start.js
# Jika ini jalan, masalah di config/plugins
```

---

## ✅ Verification

Setelah fix, pastikan:

```bash
# 1. Test dependencies
node test.js
✅ All tests passed

# 2. Start bot
npm start
✅ Bot starts without error

# 3. Connect to WhatsApp
✅ QR scanned / Pairing code entered

# 4. Test commands
.ping
✅ Bot replies

.menu
✅ Menu shows
```

---

## 📝 Quick Commands

```bash
# Fix semua error
npm run fix
# atau
./fix-bot.bat

# Test dependencies
node test.js

# Start minimal mode
node quick-start.js

# Start normal mode
npm start

# Start with pairing
node index.js --pairing-code

# Clean install
npm run clean-install
```

---

**Last Updated:** February 2026
**Version:** 2.0.1

Jika guide ini tidak membantu, screenshot error dan tanya ke support!

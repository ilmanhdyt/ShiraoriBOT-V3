# 🤖 NIA-AI WhatsApp Bot - Updated Version 2.0

Bot WhatsApp Multi-Device menggunakan Baileys versi terbaru dengan fitur AI dan Downloader.

## ✨ Fitur Baru

### 🆕 Yang Sudah Ditambahkan:
- ✅ **AI Integration**
  - ChatGPT (OpenAI GPT-3.5-turbo)
  - Google Gemini AI
  
- ✅ **Downloader**
  - YouTube (MP3 & MP4)
  - TikTok (No Watermark)

- ✅ **Core Updates**
  - Baileys 6.7.8 (versi terbaru & stabil)
  - Dependencies updated ke versi terbaru
  - Bug fixes untuk syntax errors
  - Support pairing code
  - Better error handling

## 📋 Prerequisites (Windows)

Sebelum install, pastikan sudah install:

1. **Node.js** (v18 atau lebih baru)
   - Download: https://nodejs.org/
   - Cek versi: `node -v`

2. **Git** (untuk clone repository)
   - Download: https://git-scm.com/
   
3. **FFmpeg** (untuk media processing)
   - Download: https://ffmpeg.org/download.html
   - Tambahkan ke PATH Windows

4. **ImageMagick** (optional, untuk sticker)
   - Download: https://imagemagick.org/

## 🚀 Cara Install (Windows)

### Step 1: Clone atau Extract Repository

Jika sudah punya file zip, extract saja. Atau clone:
```bash
git clone https://github.com/ilmanhdyt/nia-ai.git
cd nia-ai
```

### Step 2: Install Dependencies

Buka Command Prompt atau PowerShell di folder bot, lalu jalankan:

```bash
npm install
```

⏱️ Proses ini akan memakan waktu beberapa menit tergantung koneksi internet.

### Step 3: Konfigurasi (Opsional)

Edit file `config.js` untuk mengubah:

1. **Owner Number** (Wajib!)
```javascript
global.owner = ['62xxxxxxxxxxxx'] // Ganti dengan nomor Anda
```

2. **Bot Name & Watermark**
```javascript
global.namabot = 'NamaBot Anda'
global.packname = 'Sticker Pack Name'
global.author = 'Nama Anda'
global.wm = '© Bot Name - Your Name'
```

3. **AI API Keys** (Untuk fitur AI - Opsional)
```javascript
// OpenAI ChatGPT
global.openai_key = 'sk-xxxxxxxxxxxxxxxx'
// Cara dapat: https://platform.openai.com/api-keys

// Google Gemini
global.gemini_key = 'AIxxxxxxxxxxxxxxxxxx'
// Cara dapat: https://makersuite.google.com/app/apikey
```

> ⚠️ **Catatan AI:**
> - ChatGPT membutuhkan API key berbayar (minimal $5 credit)
> - Gemini AI gratis dengan quota terbatas
> - Jika tidak punya API key, fitur AI tidak akan jalan tapi bot tetap bisa digunakan

### Step 4: Jalankan Bot

Ada 2 cara menjalankan:

**A. Dengan QR Code (Scan dari HP)**
```bash
npm start
```
Scan QR code yang muncul dengan WhatsApp Anda (Linked Devices).

**B. Dengan Pairing Code (Tanpa Scan)**
```bash
node index.js --pairing-code
```
Masukkan nomor WhatsApp Anda (contoh: 628123456789), lalu masukkan kode pairing yang muncul ke WhatsApp.

## 📱 Cara Connect ke WhatsApp

### Metode 1: QR Code
1. Jalankan `npm start`
2. Buka WhatsApp di HP
3. Menu → Linked Devices → Link a Device
4. Scan QR Code yang muncul di terminal

### Metode 2: Pairing Code (Recommended)
1. Jalankan `node index.js --pairing-code`
2. Masukkan nomor WhatsApp (format: 628xxx)
3. Kode pairing akan muncul (contoh: ABCD-EFGH)
4. Buka WhatsApp → Linked Devices → Link a Device
5. Pilih "Link with phone number instead"
6. Masukkan kode pairing

## 🎯 Testing Bot

Setelah berhasil connect, coba test dengan mengirim pesan ke bot:

```
.menu          - Lihat semua command
.ping          - Test bot hidup
.owner         - Info owner

# AI Commands (jika sudah setup API key)
.ai Apa itu JavaScript?
.gemini Jelaskan tentang AI
.gpt Buatkan puisi

# Downloader Commands
.ytmp3 https://youtube.com/watch?v=xxxxx
.ytmp4 dj viral 2024
.tiktok https://vt.tiktok.com/xxxxx
```

## 🔧 Troubleshooting

### Error: Cannot find module 'X'
**Solusi:** Install ulang dependencies
```bash
npm install
```

### Error: FFmpeg not found
**Solusi:** 
1. Download FFmpeg dari https://ffmpeg.org/
2. Extract ke C:\ffmpeg
3. Tambahkan C:\ffmpeg\bin ke Windows PATH
4. Restart terminal

### Bot tidak merespon
**Cek:**
1. Apakah bot masih connect? (lihat console)
2. Apakah prefix benar? (default: . / # ! dll)
3. Coba restart bot

### Error: API key invalid (ChatGPT/Gemini)
**Solusi:**
1. Pastikan API key sudah dimasukkan di `config.js`
2. Cek apakah API key valid
3. Untuk OpenAI, pastikan ada credit/billing
4. Untuk Gemini, cek quota limit

### Session logout sendiri
**Solusi:**
1. Hapus folder `session`
2. Jalankan ulang bot dan scan/pairing lagi

## 📁 Struktur Project

```
nia-ai/
├── config.js          # Konfigurasi bot (EDIT INI!)
├── index.js           # Entry point
├── main.js            # Core bot logic
├── handler.js         # Message handler
├── package.json       # Dependencies
├── plugins/           # Plugin folder
│   ├── menu.js       # Menu command
│   ├── ai-chatgpt.js # ChatGPT plugin (NEW!)
│   ├── ai-gemini.js  # Gemini AI plugin (NEW!)
│   ├── dl-youtube.js # YouTube downloader (NEW!)
│   └── dl-tiktok.js  # TikTok downloader (NEW!)
├── lib/              # Library functions
├── src/              # Resources
└── session/          # WhatsApp session data

```

## 🎨 Menambah Plugin Sendiri

Buat file baru di folder `plugins/`, contoh `plugins/test.js`:

```javascript
let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Kode command Anda
    m.reply('Hello World!')
}

handler.help = ['test']
handler.tags = ['main']
handler.command = /^(test)$/i

module.exports = handler
```

Bot akan auto-reload plugin saat file berubah!

## 🔄 Update Bot

Jika ada update di repository:

```bash
git pull origin master
npm install
```

## 📞 Support

- GitHub Issues: https://github.com/ilmanhdyt/nia-ai/issues
- Original Author: [@ilmanhdyt](https://github.com/ilmanhdyt)
- Updated by: Claude AI

## ⚠️ Disclaimer

- Bot ini hanya untuk edukasi dan personal use
- Jangan spam atau abuse WhatsApp API
- Gunakan API key AI dengan bijak (ada biaya/quota)
- Owner tidak bertanggung jawab atas penyalahgunaan

## 📝 Changelog v2.0

### Fixed:
- ✅ Syntax errors di main.js
- ✅ Missing imports (PHONENUMBER_MCC, Boom, dll)
- ✅ Deprecated dependencies
- ✅ Connection handling
- ✅ Pairing code implementation

### Added:
- ✅ ChatGPT integration
- ✅ Google Gemini AI integration  
- ✅ YouTube downloader (MP3/MP4)
- ✅ TikTok downloader (no watermark)
- ✅ Better error messages
- ✅ Complete documentation

### Updated:
- ✅ Baileys → v6.7.8
- ✅ All dependencies to latest stable versions
- ✅ Better code structure

## 🙏 Credits

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Nurutomo](https://github.com/Nurutomo) - Base bot structure
- [ilmanhdyt](https://github.com/ilmanhdyt) - Original Nia-AI
- OpenAI - ChatGPT API
- Google - Gemini AI

---

**Selamat mencoba! 🎉**

Jika ada pertanyaan atau masalah, silakan buat issue di GitHub.

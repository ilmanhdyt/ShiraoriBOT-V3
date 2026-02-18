<p align="center">
<img src="https://telegra.ph/file/06db0eb84b88d11d76e6a.jpg" alt="SHIRAORI BOT" width="500"/>
</p>

<p align="center">
<a href="#"><img title="ShiraoriBOT - WhatsApp Base Bot" src="https://img.shields.io/badge/ShiraoriBOT-Base%20WhatsApp%20Bot-green?colorA=%23ff0000&colorB=%23017e40&style=for-the-badge"></a>
</p>

<p align="center">
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Author" src="https://img.shields.io/badge/Author-Ilman-red.svg?style=for-the-badge&logo=github"></a>
</p>

<p align="center">
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Followers" src="https://img.shields.io/github/followers/ilmanhdyt?color=blue&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Stars" src="https://img.shields.io/github/stars/ilmanhdyt/ShiraoriBOT-Md?color=red&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md/network/members"><img title="Forks" src="https://img.shields.io/github/forks/ilmanhdyt/ShiraoriBOT-Md?color=red&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md/watchers"><img title="Watching" src="https://img.shields.io/github/watchers/ilmanhdyt/ShiraoriBOT-Md?label=Watchers&color=blue&style=flat-square"></a>
</p>

---

> ⚠️ **PERHATIAN / DISCLAIMER**
>
> **Script ini adalah BASE BOT WhatsApp** — hanya fondasi/kerangka dasar untuk membangun bot WhatsApp sendiri.
> Fitur yang tersedia masih terbatas dan belum lengkap. Script ini **bukan bot jadi** dan **tidak dimaksudkan untuk langsung dipakai sebagai bot production**.
> Developer diharapkan mengembangkan dan menambahkan fitur sendiri sesuai kebutuhan.

---

# 🤖 ShiraoriBOT — WhatsApp Base Bot

ShiraoriBOT adalah **base / kerangka bot WhatsApp** yang dibangun menggunakan library [Baileys](https://github.com/WhiskeySockets/Baileys) (Multi-Device). Cocok digunakan sebagai titik awal untuk membangun bot WhatsApp kamu sendiri.

---

## ✨ Fitur yang Tersedia (9 Fitur)

### 🧠 AI
| Command | Deskripsi |
|--------|-----------|
| `.chatgpt` / `.gpt` / `.ai` | Tanya jawab menggunakan ChatGPT (OpenAI GPT-3.5 Turbo) |
| `.gemini` | Tanya jawab menggunakan Google Gemini 2.0 Flash |

### 🎨 Sticker & Converter
| Command | Deskripsi |
|--------|-----------|
| `.stiker` / `.s` | Buat stiker dari gambar, video (max 10 detik), atau URL |
| `.toimage` / `.toimg` | Konversi stiker (webp) menjadi gambar |
| `.brat` | Buat stiker gaya *brat* dengan teks kustom (butuh ImageMagick) |

### 📥 Downloader
| Command | Deskripsi |
|--------|-----------|
| `.ytmp3` / `.ytaudio` | Download audio YouTube (max 10 menit) |
| `.ytmp4` / `.ytvideo` | Download video YouTube (max 5 menit) |
| `.gitclone` | Download repository GitHub sebagai file `.zip` |

### ⚙️ Utilitas & Owner
| Command | Deskripsi |
|--------|-----------|
| `.menu` | Tampilkan daftar semua perintah bot |
| `.owner` | Tampilkan kontak owner bot |
| `.testowner` | Debug & cek konfigurasi owner (owner only) |

---

## 🛠️ Instalasi

### Persyaratan Sistem

Sebelum menjalankan bot, pastikan kamu sudah menginstal semua dependensi berikut:

- **[Node.js](https://nodejs.org/en/download)** (v18 atau lebih baru)
- **[Git](https://git-scm.com/downloads)**
- **[FFmpeg](https://ffmpeg.org/download.html)** — diperlukan untuk fitur stiker dari video dan konversi media
- **[ImageMagick](https://imagemagick.org/script/download.php)** — diperlukan untuk fitur Brat stiker generator

> ⚠️ Untuk Windows: Pastikan FFmpeg dan ImageMagick sudah ditambahkan ke **System PATH** setelah instalasi.

---

### 🪟 Windows / VPS / RDP

```bash
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md
cd ShiraoriBOT-Md
npm install
npm start
```

> Untuk menjalankan menggunakan pairing code:
> ```bash
> npm run pairing
> ```

---

### 📱 Termux (Android)

```bash
pkg update && pkg upgrade
pkg install git nodejs ffmpeg imagemagick
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md
cd ShiraoriBOT-Md
npm install
node main.js
```

---

### ☁️ Heroku

**Install Buildpack berikut (urutan penting):**
1. `heroku/nodejs`
2. `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`
3. `https://github.com/DuckyTeam/heroku-buildpack-imagemagick.git`

---

## 🔑 Konfigurasi API Key

Edit file `config.js` dan isi API key sesuai fitur yang ingin digunakan:

```js
// Untuk fitur ChatGPT
global.openai_key = 'YOUR_OPENAI_API_KEY'  
// Daftar di: https://platform.openai.com/api-keys

// Untuk fitur Gemini
global.gemini_key = 'YOUR_GEMINI_API_KEY'  
// Daftar di: https://aistudio.google.com/app/apikey
```

> API key tidak wajib jika kamu tidak menggunakan fitur AI.

---

## 🗄️ Koneksi MongoDB (Heroku)

1. Buat akun dan database di [MongoDB Atlas](https://youtu.be/rPqRyYJmx2g)
2. Ambil connection string (mongourl) dari Atlas
3. Tambahkan ke `Procfile`:

```
web: node . --db 'mongodb+srv://USER:PASSWORD@cluster0.xxx.mongodb.net/ShiraoriBOT?retryWrites=true&w=majority'
```

---

## 🖼️ Kustomisasi Tampilan Menu

Kamu bisa mengubah tampilan menu menjadi beberapa mode:

<details>
<summary>📹 GIF / Video Menu</summary>

```js
let message = await prepareWAMessageMedia(
  { video: fs.readFileSync('./media/shiro.mp4'), gifPlayback: true },
  { upload: conn.waUploadToServer }
)
```
</details>

<details>
<summary>🖼️ Image Menu</summary>

```js
let message = await prepareWAMessageMedia(
  { image: fs.readFileSync('./media/shiraori.jpg') },
  { upload: conn.waUploadToServer }
)
```
</details>

<details>
<summary>📍 Location Thumbnail Menu</summary>

```js
locationMessage: { jpegThumbnail: fs.readFileSync('./media/shiraori.jpg') }
```
</details>

---

## 🐛 Bug & Kontribusi

- Jika menemukan bug, silakan buka [Issues](https://github.com/ilmanhdyt/ShiraoriBOT-Md/issues)
- Chat langsung ke [Owner](https://wa.me/6281351047727)
- Coba bot demo [di sini](https://wa.me/62895803135347?text=.menu)

---

## 👨‍💻 Developer

<h3 align="center">Made by:</h3>
<p align="center">
  <a href="https://github.com/ilmanhdyt"><img src="https://github.com/ilmanhdyt.png?size=128" height="128" width="128" /></a>
  <a href="https://github.com/BochilGaming"><img src="https://github.com/BochilGaming.png?size=128" height="128" width="128" /></a>
</p>

---

## 🙏 Thanks To

| [![Nurutomo](https://github.com/Nurutomo.png?size=100)](https://github.com/Nurutomo) | [![Ilman](https://github.com/ilmanhdyt.png?size=100)](https://github.com/ilmanhdyt) | [![Istikmal](https://github.com/BochilGaming.png?size=100)](https://github.com/BochilGaming) |
|:---:|:---:|:---:|
| [Nurutomo](https://github.com/Nurutomo) | [Ilman](https://github.com/ilmanhdyt) | [Istikmal](https://github.com/BochilGaming) |
| Author Utama | Pengembang Fitur | Pemilik Source Code |

---

## 💸 Donasi

Jika project ini bermanfaat, kamu bisa support developer melalui:

- [Saweria](https://saweria.co/ilmanhdyt)

---

<p align="center">
  <b>⭐ Jangan lupa kasih star kalau project ini membantu kamu! ⭐</b><br/>
  <i>ShiraoriBOT — Base WhatsApp Bot | Powered by Baileys</i>
</p>

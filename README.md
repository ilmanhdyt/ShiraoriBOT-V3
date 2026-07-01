<p align="center">
<img src="https://telegra.ph/file/06db0eb84b88d11d76e6a.jpg" alt="SHIRAORI BOT" width="500"/>
</p>

<p align="center">
<a href="#"><img title="ShiraoriBOT - WhatsApp Bot" src="https://img.shields.io/badge/ShiraoriBOT-WhatsApp%20Bot-green?colorA=%23ff0000&colorB=%23017e40&style=for-the-badge"></a>
</p>

<p align="center">
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Author" src="https://img.shields.io/badge/Author-Ilman-red.svg?style=for-the-badge&logo=github"></a>
<a href="#"><img title="Library" src="https://img.shields.io/badge/Library-shiraori--baileys-blueviolet.svg?style=for-the-badge&logo=npm"></a>
</p>

<p align="center">
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Followers" src="https://img.shields.io/github/followers/ilmanhdyt?color=blue&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md"><img title="Stars" src="https://img.shields.io/github/stars/ilmanhdyt/ShiraoriBOT-Md?color=red&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md/network/members"><img title="Forks" src="https://img.shields.io/github/forks/ilmanhdyt/ShiraoriBOT-Md?color=red&style=flat-square"></a>
<a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md/watchers"><img title="Watching" src="https://img.shields.io/github/watchers/ilmanhdyt/ShiraoriBOT-Md?label=Watchers&color=blue&style=flat-square"></a>
</p>

---

> ⚠️ **DISCLAIMER**
>
> ShiraoriBOT dibangun sebagai **kerangka bot WhatsApp yang sudah berisi banyak fitur siap pakai** (RPG, ekonomi, game, downloader, stiker, dan tools owner), bukan sekadar "bot kosong".
> Meski begitu, project ini tetap terbuka untuk dikembangkan lebih jauh — silakan tambah, ubah, atau hapus plugin sesuai kebutuhan kamu sendiri.

---

# 🤖 ShiraoriBOT — WhatsApp Bot

ShiraoriBOT adalah bot WhatsApp Multi-Device yang dibangun di atas library **[`shiraori-baileys`](https://www.npmjs.com/package/shiraori-baileys)** — library Baileys kustom milik sendiri, dipadukan secara *hybrid* dengan **[`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys)** resmi melalui *compatibility layer* (`lib/baileys-compat.js`). Pendekatan ini memungkinkan bot tetap memakai fitur-fitur terbaru dari Baileys resmi, sekaligus mendapat utilitas tambahan dan beberapa perbaikan khusus dari `shiraori-baileys` — terutama untuk resolusi **LID (Linked ID)** WhatsApp yang sering bikin pusing developer bot lain.

[Coba Bot Nya](https://wa.me/62895803135347)
[Grup Wa](https://chat.whatsapp.com/CKYb50fuGk22r3LSTmhb37?s=cl&p=a&ilr=1) 
---

## ✨ Fitur

Bot ini memiliki **70+ command** yang tersebar di berbagai kategori, ditambah beberapa sistem otomatis yang berjalan di balik layar. Ketik `.menu` di bot untuk daftar lengkap & ter-update sesuai plugin yang aktif.

### 🏠 Utama
| Command | Deskripsi |
|---|---|
| `.menu` / `.help` / `.?` | Tampilkan menu & daftar command |
| `.daftar <nama>.<umur>` / `.register` | Registrasi akun |
| `.unreg <SN>` | Hapus akun (butuh Serial Number) |
| `.afk [alasan]` | Set status AFK |
| `.ktp` | Buat KTP virtual karakter kamu |
| `.ceksn` / `.mysn` / `.sn` | Cek Serial Number akun |
| `.expired` | Cek member grup yang masa sewanya habis *(khusus grup)* |
| `.my` / `.profile` | Lihat profil (sendiri, tag, atau reply) |

### ⚔️ RPG & Petualangan
| Command | Deskripsi |
|---|---|
| `.adventure` / `.adv` / `.petualangan` | Mulai sesi petualangan |
| `.dungeon` | Masuk dungeon |
| `.hunting` / `.hunt` / `.berburu` | Berburu monster/item |
| `.mancing`, `.mining`, `.kebun`/`.tanam`, `.mulung` | Aktivitas harian (memancing, menambang, berkebun, memulung) |
| `.gacha` | Gacha item/karakter |
| `.open legendary` / `.open pet [jumlah]` | Buka box legendary/pet |
| `.crafting` / `.craft` | Crafting item |
| `.collect` | Klaim koleksi item |
| `.equip` / `.unequip` | Pasang/lepas equipment |
| `.inventori` / `.inv` | Lihat inventory |
| `.toko` / `.shop`, `.buy <item>`, `.sell <item>` | Belanja & jual item di toko |
| `.daily`, `.weekly`, `.monthly` | Klaim reward harian/mingguan/bulanan |
| `.hadiah` | Klaim hadiah event |
| `.work` / `.kerja` | Kerja untuk dapat koin |
| `.maling` / `.begal` / `.rampok @user` | Coba curi koin user lain *(cooldown 10 menit)* |
| `.wanted` / `.riwayatmaling` | Papan buronan & riwayat aksi maling |
| `.leaderboard` / `.lb [koin/level/pet]` | Papan peringkat |

### 🎰 Game & Judi
| Command | Deskripsi |
|---|---|
| `.game` / `.minigame [easy/medium/hard]` | Tebak gambar dengan tingkat kesulitan |
| `.hint` | Minta hint saat minigame berjalan |
| `.slot` | Slot machine |
| `.blackjack` / `.bj` | Blackjack |
| `.sabung` / `.cockfight` / `.cf` | Sabung ayam, `.chickenstats` untuk lihat statistik |

### 🏦 Ekonomi
| Command | Deskripsi |
|---|---|
| `.bank` | Info saldo bank |
| `.dep` / `.deposit <jumlah/all>` | Deposit ke bank |
| `.wd` / `.withdraw <jumlah/all>` | Tarik dari bank |
| `.transfer` / `.tf @user <jml>` | Transfer antar rekening bank |
| `.rob bank` | Rampok bank *(risiko tinggi)* |
| `.creditcore` | Cek credit score |
| `.dompet` | Cek dompet/uang cash |
| `.kirim @user <nominal>` | Kirim koin ke user lain, `.kirim riwayat`/`.kirim top` |
| `.bansos` | Klaim bantuan sosial harian |

### 🎨 Stiker & Maker
| Command | Deskripsi |
|---|---|
| `.sticker` / `.s` | Buat stiker dari gambar/video (reply atau kirim langsung) |
| `.toimage` / `.toimg` | Ubah stiker (webp) jadi gambar |
| `.brat <teks>` | Stiker gaya *brat*, via API eksternal |
| `.watermark` / `.setwm <packname>\|<author>` | Ubah watermark stiker default kamu |
| `.iqc <teks>` | Buat stiker quote ala chat |
| `.ihh` *(reply pesan sekali-lihat)* | Buka ulang foto/video *view once* |

### 📥 Downloader
| Command | Deskripsi |
|---|---|
| `.tiktok <url>` | Download video TikTok |
| `.ig` / `.instagram <url>` | Download media Instagram |
| `.pinterest <query> [jumlah]` | Cari & download gambar Pinterest |
| `.play <judul/link>` | Download audio YouTube |
| `.gitclone <url>` | Download repo GitHub sebagai `.zip` |

### 🔧 Tools & Lainnya
| Command | Deskripsi |
|---|---|
| `.ssweb` / `.ss <url> [full \| <w> <h>]` | Screenshot halaman web |
| `.zodiak <tgl bln thn>` | Cek zodiak dari tanggal lahir |
| `.menfess <nomor/mention> <pesan>` | Kirim pesan anonim (menfess) |

### ℹ️ Info
| Command | Deskripsi |
|---|---|
| `.ping` | Cek kecepatan respon bot |
| `.owner` / `.creator` | Kontak owner bot |
| `.runtime` / `.uptime` | Lama bot online |
| `.sourcecode` / `.sc` | Link source code |
| `.report <pesan>` / `.request <pesan>` | Kirim laporan bug/request fitur ke owner |
| `.limit` | Cek sisa limit harian |
| `.donasi` | Info donasi |
| `.infobot` | Info detail bot |

### 👑 Owner & Admin Tools
| Command | Deskripsi |
|---|---|
| `.ban` / `.unban` | Ban/unban user dari bot |
| `.addprem` / `.delprem` / `.listprem` | Kelola user premium |
| `.addsewa <link/id> <hari>` / `.listsewa` / `.delsewa` / `.perpanjang` | Kelola masa sewa bot di grup |
| `.addexp` / `.delexp` | Tambah/kurangi EXP user |
| `.addmoney` / `.setmoney` / `.reducemoney` | Kelola koin user |
| `.listuser` / `.cekuser` / `.totaluser` | Lihat & cari data user terdaftar |
| `.setlid <nomor> <lid>` / `list` / `hapus` / `cek` | Kelola mapping LID ↔ nomor secara manual |
| `.jidgrup` | Cek JID grup |
| `.on` / `.off <opsi>` | Toggle fitur tertentu di grup |
| `.balasreport` / `.balasrequest <pesan>` | Balas laporan/request dari user |
| `.pesanotomatis` | Kirim pesan ke nomor/grup tertentu lewat bot |
| `.restart` | Restart bot |
| `.boost` | Bersihkan memori bot secara manual |
| `> kode` / `=> kode` | Eval JavaScript langsung *(advanced, berisiko)* |

### 🛡️ Sistem Otomatis (Background)
Selain command di atas, ada beberapa sistem yang berjalan otomatis tanpa perlu diketik:
- **Anti-toxic** — moderasi kata kasar otomatis dengan sistem warning bertingkat
- **Anti-spam & auto-ban** — deteksi spam command dan ban sementara otomatis
- **Auto level-up** — notifikasi otomatis saat user naik level
- **Auto-resolve LID** — deteksi & pemetaan otomatis `@lid` ↔ nomor WhatsApp asli (bagian dari arsitektur `LID_fix`)
- **Mention guard** — pengecekan status registrasi user yang di-tag pakai `@lid`
- **Auto-update role** — role user otomatis menyesuaikan level

---

## 🛠️ Instalasi

### Persyaratan Sistem

- **[Node.js](https://nodejs.org/en/download)** v18 atau lebih baru
- **[Git](https://git-scm.com/downloads)**
- **[FFmpeg](https://ffmpeg.org/download.html)** — dibutuhkan untuk konversi stiker dari video/gambar

> ⚠️ Untuk Windows: pastikan FFmpeg sudah ditambahkan ke **System PATH** setelah instalasi.

---

### 🪟 Windows / VPS / RDP

```bash
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md
cd ShiraoriBOT-Md
npm install
npm start
```

Saat pertama kali dijalankan, akan muncul **QR Code** di terminal — scan lewat WhatsApp di ponsel kamu (Linked Devices).

---

### 📱 Termux (Android)

```bash
pkg update && pkg upgrade
pkg install git nodejs ffmpeg
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md
cd ShiraoriBOT-Md
npm install
node main.js
```

---

### ☁️ Heroku / VPS dengan Buildpack

**Install buildpack berikut (urutan penting):**
1. `heroku/nodejs`
2. `https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`

Buat file `Procfile` di root project:
```
web: node main.js
```

> Pakai database eksternal (lihat bagian MongoDB di bawah) kalau deploy di platform dengan filesystem sementara seperti Heroku, supaya data user tidak hilang setiap restart/redeploy.

---

### ▲ PM2 / Auto-restart (opsional)

```bash
npm install -g pm2
pm2 start main.js --name ShiraoriBOT
```

Atau pakai script bawaan `keep-alive.sh` untuk auto-restart sederhana tanpa PM2:
```bash
bash keep-alive.sh
```

---

## 🗄️ Database

Secara default, ShiraoriBOT memakai database lokal berbasis file JSON (lowdb) di folder `database/`. Tidak perlu setup tambahan untuk mulai memakai bot.

Kalau butuh database eksternal (misalnya untuk deploy di platform dengan storage sementara), bot mendukung MongoDB lewat flag `--db`:

```bash
node main.js --db "mongodb+srv://USER:PASSWORD@cluster0.xxx.mongodb.net/ShiraoriBOT?retryWrites=true&w=majority"
```

1. Buat akun & database di [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Ambil connection string dari Atlas
3. Tambahkan ke `Procfile` (untuk Heroku) atau jalankan langsung lewat flag di atas

---

## ⚙️ Konfigurasi Dasar

Beberapa hal bisa diatur langsung di `config.js`:

```js
global.owner   = ['62812xxxxxxxx']      // Nomor owner bot
global.lokasi  = 'Makassar, Indonesia'  // Lokasi bot (untuk fitur cuaca/lokasi)
global.namabot = 'ShiraoriBOT'          // Nama bot
global.wm      = '© ShiraoriBOT-Md'     // Watermark default
```

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
  <i>ShiraoriBOT — Powered by shiraori-baileys</i>
</p>

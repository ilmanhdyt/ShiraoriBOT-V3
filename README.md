<h1 align="center">ShiraoriBOT</h1>

<p align="center">
  <img src="https://telegra.ph/file/06db0eb84b88d11d76e6a.jpg" alt="ShiraoriBOT" width="500" />
</p>

<p align="center">
  <a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md">
    <img src="https://img.shields.io/badge/WhatsApp%20Bot-ShiraoriBOT-2ecc71?style=for-the-badge" alt="ShiraoriBOT" />
  </a>
  <a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-2E8B57?style=for-the-badge" alt="License: MIT" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/node.js-18%2B-339933?logo=node.js&style=for-the-badge" alt="Node.js 18+" />
  </a>
  <a href="https://github.com/ilmanhdyt/ShiraoriBOT-Md">
    <img src="https://img.shields.io/badge/status-active-2ECC71?style=for-the-badge" alt="Status: active" />
  </a>
</p>

ShiraoriBOT adalah bot WhatsApp Multi-Device yang dirancang untuk mengelola grup, meningkatkan interaksi pengguna, dan memberikan respon cepat dengan fitur yang cukup lengkap. Bot ini menyatukan sistem RPG, ekonomi, downloader, stiker, hingga alat owner dalam satu ekosistem yang bisa dikembangkan lebih lanjut.

## Disclaimer

**PENTING**: ShiraoriBOT disediakan untuk keperluan edukasi, personal, dan pengembangan pribadi. Pastikan kamu:

- Menggunakan secara bertanggung jawab dan tidak spam atau mengganggu pengguna lain.
- Menjaga privasi data pengguna dan tidak menyalahgunakan informasi yang diterima.
- Tidak menggunakan untuk tujuan komersial tanpa izin yang jelas.
- Mematuhi aturan dan regulasi yang berlaku di wilayah kamu.

Pengembang tidak bertanggung jawab atas penyalahgunaan bot atau konsekuensi yang timbul dari penggunaannya. Pengguna bertanggung jawab penuh atas tindakan mereka sendiri.

> [!CAUTION]
> WhatsApp dapat membatasi atau memblokir akun yang melanggar kebijakan layanan mereka. Gunakan bot ini dengan risiko yang kamu tanggung sendiri.

## Kenapa ShiraoriBOT?

ShiraoriBOT menggabungkan beberapa kemampuan dalam satu pengalaman bot:

- Alat manajemen grup dan komunitas untuk admin.
- Sistem ekonomi dengan saldo, kerja, hadiah harian, inventori, dan leaderboard.
- Beragam fitur hiburan dan utilitas seperti downloader, stiker, dan tools owner.
- Arsitektur plugin yang memudahkan penambahan fitur baru.

## Fitur

### Fitur Teknis

- **Cepat dan responsif**: dirancang untuk menjalankan banyak fitur tanpa terlalu banyak overhead.
- **Modular**: plugin dapat ditambahkan atau diubah dengan mudah.
- **Sistem izin**: fitur khusus owner/admin dapat dibatasi sesuai kebutuhan.
- **Auto-save database**: data tersimpan secara berkala untuk mengurangi risiko kehilangan.
- **Antarmuka kaya emoji**: respons bot lebih menarik dan informatif.

### Kapabilitas Utama

- **Manajemen grup**: fitur seperti registrasi pengguna, status AFK, cek profil, dan alat admin.
- **Sistem RPG & ekonomi**: adventure, dungeon, hunting, daily, weekly, monthly, work, bank, transfer, dan leaderboard.
- **Downloader & media**: TikTok, Instagram, Pinterest, YouTube, serta GitHub.
- **Stiker & kreator**: pembuatan stiker, konversi gambar, watermark, dan fitur maker lain.
- **Tools owner**: manajemen premium, sewa grup, add/remove EXP, add/set money, dan utilitas admin lanjutan.

## Prasyarat

Sebelum menjalankan ShiraoriBOT secara lokal, pastikan perangkat kamu sudah memiliki:

### Windows

- [Node.js](https://nodejs.org/) dan npm
- [Git](https://git-scm.com/download/win)
- Terminal bawaan

### macOS

- [Node.js](https://nodejs.org/) dan npm
- [Git](https://git-scm.com/download/mac)
- Terminal bawaan

### Linux

- [Node.js](https://nodejs.org/en/download)
- [Git](https://git-scm.com/install/linux)
- Terminal bawaan

### FFmpeg

FFmpeg diperlukan untuk beberapa fitur media dan konversi stiker.

**Verifikasi instalasi:**

```bash
node --version
npm --version
git --version
ffmpeg -version
```

## Quick Start

### 1. Clone repository

```bash
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md.git
cd ShiraoriBOT-Md
```

### 2. Install dependency

```bash
npm install
```

### 3. Konfigurasi lingkungan

Buat file `.env` jika kamu ingin menyimpan konfigurasi environment:

```bash
# Linux / macOS
touch .env

# Windows
> .env
```

Contoh isi `.env`:

```env
PAIRING_NUMBER=6281234567890
OPENAI_KEY=
GEMINI_KEY=
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

### 4. Jalankan bot

```bash
npm start
```

### 5. Hubungkan WhatsApp

- Bot akan menampilkan pairing code di terminal.
- Masuk ke WhatsApp kamu lalu sambungkan perangkat melalui kode pairing.
- Setelah berhasil, bot siap menerima perintah.

## Konfigurasi

Beberapa pengaturan dapat diatur melalui file [config.js](config.js) dan environment variable.

| Variabel           | Keterangan                                           | Default |
| ------------------ | ---------------------------------------------------- | ------- |
| `PAIRING_NUMBER`   | Nomor target untuk pairing saat sesi belum terdaftar | kosong  |
| `OPENAI_KEY`       | Kunci API OpenAI jika digunakan oleh fitur tertentu  | kosong  |
| `GEMINI_KEY`       | Kunci API Gemini jika digunakan oleh fitur tertentu  | kosong  |
| `TELEGRAM_TOKEN`   | Token bot Telegram jika fitur Telegram aktif         | kosong  |
| `TELEGRAM_CHAT_ID` | ID chat Telegram untuk notifikasi                    | kosong  |

## Struktur Project

Kode utama berada di beberapa folder penting:

| Path                     | Tujuan                                                             |
| ------------------------ | ------------------------------------------------------------------ |
| [main.js](main.js)       | Entry point utama dan lifecycle bot                                |
| [handler.js](handler.js) | Handler pesan dan event WhatsApp                                   |
| [plugins](plugins)       | Implementasi perintah dan fitur bot                                |
| [database](database)     | Data lokal bot seperti JSON, cache, dan state                      |
| [lib](lib)               | Utilitas, adapter, dan helper pendukung                            |
| [src](src)               | Layer arsitektur baru untuk konteks, queue, scheduler, dan service |
| [views](views)           | Tampilan web/antarmuka pendukung jika digunakan                    |

## Gambaran Perintah

Bot ini memiliki banyak perintah yang bisa dijalankan langsung di chat. Beberapa contohnya:

- Umum: `.menu`, `.help`, `.ping`, `.owner`, `.runtime`
- RPG & ekonomi: `.adventure`, `.daily`, `.work`, `.bank`, `.transfer`, `.leaderboard`
- Media: `.sticker`, `.toimage`, `.play`, `.tiktok`, `.instagram`
- Owner/admin: `.ban`, `.addprem`, `.addmoney`, `.setmoney`, `.restart`

## Pengembangan

### Menambahkan plugin baru

1. Buat file baru di folder [plugins](plugins).
2. Ekspor fungsi handler atau module plugin sesuai pola yang sudah ada.
3. Jalankan bot lagi dan plugin akan dimuat otomatis oleh loader di [main.js](main.js).

Contoh sederhana:

```js
module.exports = async function (m, context) {
  await m.reply('Halo dari plugin baru!');
};
```

## Keamanan & Privasi

- Data pengguna disimpan secara lokal dalam folder [database](database).
- Fitur sensitif dibatasi untuk owner/admin.
- Pastikan session dan credential tidak dibagikan ke publik.

> [!IMPORTANT]
>
> 1. Gunakan nomor pribadi yang kamu kendalikan untuk bot.
> 2. Pastikan koneksi internet stabil.
> 3. Simpan session dengan aman.
> 4. Hindari spam perintah agar tidak memicu pembatasan dari WhatsApp.

## Opsi Deploy

### Termux (Android)

```bash
pkg update && pkg upgrade
pkg install git nodejs ffmpeg
git clone https://github.com/ilmanhdyt/ShiraoriBOT-Md.git
cd ShiraoriBOT-Md
npm install
npm start
```

### VPS / Cloud Hosting

ShiraoriBOT juga bisa dijalankan di VPS atau hosting Node.js. Pastikan:

1. Mengupload seluruh isi repository.
2. Menginstall dependency dengan `npm install`.
3. Menyiapkan environment variable yang dibutuhkan.
4. Menjalankan bot dengan `npm start`.

## Troubleshooting

### Bot tidak merespons

- Periksa apakah bot sudah terhubung ke WhatsApp.
- Pastikan prefix perintah yang dipakai benar.
- Cek apakah bot ada di grup yang sesuai.

### Autentikasi gagal

- Hapus session lama jika perlu, lalu jalankan ulang bot.
- Periksa format nomor pada `PAIRING_NUMBER`.
- Pastikan koneksi internet stabil.

### Performa menurun

- Restart bot jika berjalan lama.
- Periksa sumber daya server.
- Pastikan tidak ada proses yang membebani memori secara berlebihan.

## Kontribusi

1. Fork repository ini.
2. Buat branch fitur baru.
3. Tambahkan perbaikan atau fitur yang kamu buat.
4. Uji secara menyeluruh.
5. Kirim pull request.

## Dukungan

Untuk issue, pertanyaan, atau kontribusi:

- Buka issue di repository.
- Cek dokumentasi yang ada.
- Review source code untuk contoh implementasi.

## Lisensi

Proyek ini menggunakan [MIT License](LICENSE).

---

<p align="center">
  <b>⭐ Jangan lupa kasih star kalau project ini membantu kamu! ⭐</b><br />
  <i>ShiraoriBOT | Powered by shiraori-baileys</i>
</p>

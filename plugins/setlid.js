// plugins/setlid.js
// Petakan LID (ID tersembunyi WhatsApp Community Group) ke nomor WA asli.
// Owner-only command.
//
// ═══════════════════════════════════════════════════════════════════════════
//  Mengapa dibutuhkan?
// ───────────────────
//  Di WhatsApp Community Group dengan Privacy Mode aktif, nomor anggota
//  disembunyikan. Bot hanya menerima "LID" (angka acak panjang) sebagai
//  identitas sender, bukan nomor WA asli. Akibatnya:
//    - .daftar, .daily, dsb. gagal karena bot tidak tahu siapa usernya
//    - Bot tidak bisa lookup user di DB
//
//  Solusinya: owner memetakan LID → nomor WA secara manual sekali saja.
//  Setelah itu semua command berjalan normal untuk user tersebut.
//
// ═══════════════════════════════════════════════════════════════════════════
//  Usage:
//    .setlid <nomor_wa> <lid>          → simpan mapping LID → nomor WA
//    .setlid <nomor_wa> <lid> @mention → alternatif: nomor WA boleh di-tag
//    .setlid list                      → lihat semua mapping yang tersimpan
//    .setlid hapus <lid>               → hapus satu mapping
//    .setlid reset                     → hapus semua mapping (hati-hati!)
//    .setlid cek <lid>                 → cek apakah LID ini sudah dipetakan
//
//  Contoh:
//    .setlid 6281234567890 276768380452882
//    .setlid list
//    .setlid hapus 276768380452882
//    .setlid cek 276768380452882
// ═══════════════════════════════════════════════════════════════════════════

'use strict'

const { jidToNum, looksLikeWaNumber, getDbUser, numToJid } = require('../lib/jidUtils')

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalisasi argumen LID — buang @lid suffix jika ada, ambil angka murni.
 * @param {string} raw
 * @returns {string}
 */
function cleanLid(raw = '') {
    return raw.replace(/@lid$/i, '').replace(/\s/g, '').trim()
}

/**
 * Normalisasi argumen nomor WA — buang @s.whatsapp.net, @c.us, +, spasi.
 * @param {string} raw
 * @returns {string}
 */
function cleanNum(raw = '') {
    return raw
        .replace(/@(s\.whatsapp\.net|c\.us)/gi, '')
        .replace(/[^0-9]/g, '')
        .trim()
}

/**
 * Pastikan settings & lidMap tersedia di DB global.
 */
function ensureLidMap() {
    if (!global.db.data.settings) global.db.data.settings = {}
    if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
    return global.db.data.settings.lidMap
}

/**
 * Ambil nama user dari DB jika sudah terdaftar, fallback ke nomor.
 * @param {string} num - nomor WA (tanpa @)
 * @returns {string}
 */
function userLabel(num) {
    try {
        const u = getDbUser(numToJid(num))
        return u?.registered && u?.name ? `*${u.name}* (+${num})` : `+${num}`
    } catch (_) { return `+${num}` }
}

// ── Handler Utama ────────────────────────────────────────────────────────────

let handler = async (m, { conn, args, usedPrefix, command }) => {

    const sub = (args[0] || '').toLowerCase().trim()

    // ════════════════════════════════════════════════════════════════════════
    // TANPA ARGUMEN → tampilkan bantuan
    // ════════════════════════════════════════════════════════════════════════
    if (!sub) {
        return m.reply(
`╭─「 🔗 *SETLID — Panduan* 」
│
│  Petakan LID tersembunyi WA ke nomor asli.
│
│  📋 *Command yang tersedia:*
│
│  🔵 *Simpan mapping:*
│  ${usedPrefix}setlid <nomor_wa> <lid>
│
│  📋 *Lihat semua mapping:*
│  ${usedPrefix}setlid list
│
│  🔍 *Cek satu LID:*
│  ${usedPrefix}setlid cek <lid>
│
│  🗑️ *Hapus satu mapping:*
│  ${usedPrefix}setlid hapus <lid>
│
│  ⚠️ *Hapus SEMUA mapping:*
│  ${usedPrefix}setlid reset
│
│  📌 *Contoh:*
│  ${usedPrefix}setlid 6281234567890 276768380452882
│  ${usedPrefix}setlid list
│  ${usedPrefix}setlid hapus 276768380452882
│
│  💡 LID muncul di pesan error daftar
│  atau di log console bot.
╰─────────────────────────────`.trim()
        )
    }

    // ════════════════════════════════════════════════════════════════════════
    // LIST → tampilkan semua mapping yang tersimpan
    // ════════════════════════════════════════════════════════════════════════
    if (sub === 'list') {
        const lm = ensureLidMap()
        const entries = Object.entries(lm)

        if (entries.length === 0) {
            return m.reply(
`╭─「 📋 *SETLID — List Mapping* 」
│
│  ℹ️ Belum ada mapping LID tersimpan.
│
│  Untuk menyimpan mapping:
│  *${usedPrefix}setlid <nomor_wa> <lid>*
╰─────────────────────────────`.trim()
            )
        }

        const lines = entries.map(([lid, num], i) => {
            const lidNum  = lid.replace('@lid', '')
            const label   = userLabel(num)
            return `│  ${i + 1}. \`${lidNum}\`\n│     → ${label}`
        }).join('\n│\n')

        return m.reply(
`╭─「 📋 *SETLID — Daftar Mapping* (${entries.length}) 」
│
${lines}
│
│  🗑️ Hapus: *${usedPrefix}setlid hapus <lid>*
╰─────────────────────────────`.trim()
        )
    }

    // ════════════════════════════════════════════════════════════════════════
    // CEK → periksa satu LID
    // ════════════════════════════════════════════════════════════════════════
    if (sub === 'cek') {
        if (!args[1]) return m.reply(`❌ Masukkan LID yang mau dicek!\nContoh: *${usedPrefix}setlid cek 276768380452882*`)

        const lid    = cleanLid(args[1])
        const lidJid = lid + '@lid'
        const lm     = ensureLidMap()

        if (!lm[lidJid]) {
            return m.reply(
`╭─「 🔍 *SETLID — Cek LID* 」
│
│  🔎 LID: \`${lid}\`
│  ❌ *Belum ada mapping!*
│
│  Untuk memetakan:
│  *${usedPrefix}setlid <nomor_wa> ${lid}*
╰─────────────────────────────`.trim()
            )
        }

        const num   = lm[lidJid]
        const label = userLabel(num)
        const user  = getDbUser(numToJid(num))

        return m.reply(
`╭─「 🔍 *SETLID — Cek LID* 」
│
│  🔎 LID : \`${lid}\`
│  ✅ *Sudah dipetakan!*
│
│  📱 Nomor WA : +${num}
│  👤 User DB  : ${label}
│  📊 Status   : ${user?.registered ? '✅ Terdaftar' : '⚠️ Belum daftar'}
╰─────────────────────────────`.trim()
        )
    }

    // ════════════════════════════════════════════════════════════════════════
    // HAPUS → hapus satu mapping berdasar LID
    // ════════════════════════════════════════════════════════════════════════
    if (sub === 'hapus') {
        if (!args[1]) return m.reply(`❌ Masukkan LID yang mau dihapus!\nContoh: *${usedPrefix}setlid hapus 276768380452882*`)

        const lid    = cleanLid(args[1])
        const lidJid = lid + '@lid'
        const lm     = ensureLidMap()

        if (!lm[lidJid]) {
            return m.reply(
`╭─「 🗑️ *SETLID — Hapus Mapping* 」
│
│  ❌ LID \`${lid}\` tidak ditemukan di lidMap.
│  Coba cek dulu: *${usedPrefix}setlid list*
╰─────────────────────────────`.trim()
            )
        }

        const numTerhapus = lm[lidJid]
        delete lm[lidJid]
        await global.db.write()

        return m.reply(
`╭─「 🗑️ *SETLID — Hapus Mapping* 」
│
│  ✅ Mapping berhasil dihapus!
│
│  🔎 LID dihapus : \`${lid}\`
│  📱 Nomor WA    : +${numTerhapus}
│
│  ⚠️ User dengan LID ini perlu di-setlid
│  ulang jika ingin menggunakan bot lagi.
╰─────────────────────────────`.trim()
        )
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESET → hapus semua mapping (dangerous)
    // ════════════════════════════════════════════════════════════════════════
    if (sub === 'reset') {
        // Minta konfirmasi
        if ((args[1] || '').toLowerCase() !== 'confirm') {
            return m.reply(
`╭─「 ⚠️ *SETLID — Reset Semua Mapping* 」
│
│  ⚠️ *PERINGATAN!*
│  Ini akan menghapus *SEMUA* mapping LID.
│  User dengan nomor tersembunyi tidak bisa
│  pakai bot sampai di-setlid ulang satu per satu!
│
│  Ketik perintah berikut untuk konfirmasi:
│  *${usedPrefix}setlid reset confirm*
╰─────────────────────────────`.trim()
            )
        }

        const lm    = ensureLidMap()
        const count = Object.keys(lm).length

        if (count === 0) return m.reply('ℹ️ Tidak ada mapping LID untuk direset.')

        global.db.data.settings.lidMap = {}
        await global.db.write()

        return m.reply(
`╭─「 🗑️ *SETLID — Reset Selesai* 」
│
│  ✅ *${count} mapping LID* berhasil dihapus.
│
│  ⚠️ Semua user dengan nomor tersembunyi
│  perlu di-setlid ulang satu per satu.
╰─────────────────────────────`.trim()
        )
    }

    // ════════════════════════════════════════════════════════════════════════
    // SETLID UTAMA → .setlid <nomor_wa> <lid>
    // Format fleksibel:
    //   .setlid 6281234567890 276768380452882
    //   .setlid 6281234567890 276768380452882@lid
    // ════════════════════════════════════════════════════════════════════════

    // args[0] = nomor WA (atau sub-command yang tidak dikenal)
    // args[1] = LID

    // Coba parse: args[0] = nomor, args[1] = LID
    let waNum = cleanNum(args[0])
    let lid   = args[1] ? cleanLid(args[1]) : ''

    // Fallback: bisa jadi urutan terbalik (.setlid <lid> <nomor>)
    // Deteksi: nomor WA Indonesia dimulai 62, LID biasanya numerik panjang non-62
    if (!looksLikeWaNumber(waNum) && args[1] && looksLikeWaNumber(cleanNum(args[1]))) {
        // Kemungkinan user mengetik .setlid <lid> <nomor>
        const swappedNum = cleanNum(args[1])
        const swappedLid = cleanLid(args[0])
        waNum = swappedNum
        lid   = swappedLid
    }

    // ── Validasi nomor WA ──────────────────────────────────────────────────
    if (!waNum) {
        return m.reply(
`❌ *Format salah!*

Penggunaan yang benar:
*${usedPrefix}setlid <nomor_wa> <lid>*

Contoh:
*${usedPrefix}setlid 6281234567890 276768380452882*

💡 Nomor WA harus dimulai dengan 62 (kode Indonesia).`.trim()
        )
    }

    if (!looksLikeWaNumber(waNum)) {
        return m.reply(
`❌ Nomor WA tidak valid: \`${waNum}\`

Pastikan nomor dimulai dengan *62* (tanpa + atau spasi).
Contoh yang benar: \`6281234567890\``.trim()
        )
    }

    // ── Validasi LID ───────────────────────────────────────────────────────
    if (!lid) {
        return m.reply(
`❌ *LID tidak ditemukan!*

Penggunaan:
*${usedPrefix}setlid ${waNum} <angkaLID>*

LID adalah angka panjang yang muncul di pesan error, contoh:
\`276768380452882\``.trim()
        )
    }

    if (!/^\d{5,}$/.test(lid)) {
        return m.reply(
`❌ LID tidak valid: \`${lid}\`

LID harus berupa angka panjang (minimal 5 digit), tanpa huruf.
Contoh: \`276768380452882\``.trim()
        )
    }

    // ── Simpan ke lidMap ───────────────────────────────────────────────────
    const lm     = ensureLidMap()
    const lidJid = lid + '@lid'
    const existing  = lm[lidJid]
    const isUpdate  = !!existing && existing !== waNum

    lm[lidJid] = waNum

    // Cek apakah nomor WA ini sudah ada di DB users
    const userInDb = getDbUser(numToJid(waNum))

    await global.db.write()

    // Log ke console untuk traceability
    console.log(`[setlid] ✅ Mapped: ${lid}@lid → ${waNum} (by owner, ${isUpdate ? 'UPDATE' : 'NEW'})`)

    // ── Balas dengan konfirmasi ─────────────────────────────────────────────
    const statusDb = userInDb
        ? (userInDb.registered
            ? `✅ Terdaftar (*${userInDb.name}*, Lv.${userInDb.level || 1})`
            : '⚠️ Belum daftar (belum pernah .daftar)')
        : '⚠️ Belum ada di database bot'

    const changeNote = isUpdate
        ? `\n│  🔄 *Update dari:* +${existing}`
        : ''

    await m.reply(
`╭─「 ✅ *SETLID — Mapping Berhasil* 」
│
│  🔗 LID          : \`${lid}\`
│  📱 Nomor WA     : +${waNum}
│  👤 Status DB    : ${statusDb}${changeNote}
│
│  ✔️ Mapping disimpan ke *lidMap*.
│  User sekarang bisa menggunakan bot
│  dengan perintah normal.
│
│  💡 *User langkah selanjutnya:*
│  Minta user coba *.daftar* lagi di grup,
│  atau coba command apapun.
╰─────────────────────────────`.trim()
    )

    // Jika user belum terdaftar, kirim reminder agar daftar
    if (!userInDb || !userInDb.registered) {
        await conn.sendMessage(m.chat, {
            text:
                `📢 *Mapping LID berhasil!*\n\n` +
                `User dengan LID \`${lid}\` sekarang dikenal sebagai +${waNum}.\n\n` +
                `Jika kamu adalah user tersebut, silakan ketik:\n` +
                `*${usedPrefix}daftar <nama>.<umur>*\n\n` +
                `Contoh: *${usedPrefix}daftar BotUser.20*`,
        }, { quoted: m }).catch(() => {})
    }
}

handler.help    = ['setlid <nomor> <lid>', 'setlid list', 'setlid hapus <lid>', 'setlid cek <lid>']
handler.tags    = ['owner']
handler.command = /^setlid$/i
handler.owner   = true
handler.exp     = 0

module.exports = handler
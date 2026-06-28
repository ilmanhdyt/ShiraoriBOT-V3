// plugins/menfess.js — Anonymous Menfess + Sistem Balas
// ════════════════════════════════════════════════════════════════
//  Usage (DM ke bot):
//    .menfess <nomor/mention> <pesan>      → kirim menfess ke target
//    .menfess balas <pesan>                → balas menfess terakhir yang diterima
//
//  Contoh:
//    .menfess 628xxxx haii kangen nih 😭
//    .menfess balas haii juga kamu! 😊
//
//  Syarat:
//    - Hanya bisa dipakai lewat DM (private)
//    - Target harus nomor valid / mention
//    - Pesan minimal 2 kata
//    - Sesi balas berlaku 24 jam sejak menfess diterima
// ════════════════════════════════════════════════════════════════

const { jidToNum, numToJid, getDbUser } = require('../lib/jidUtils')

// ── Deteksi gaya pesan ──────────────────────────────────────────
const ROMANTIC_KEYS = ['sayang', 'cinta', 'suka', 'kangen', 'rindu', 'romantis', 'naksir', 'crush', 'gebetan', 'heart', 'hati', 'jatuh hati', 'perasaan', 'love', 'baper', 'soulmate']
const FUNNY_KEYS    = ['wkwk', 'haha', 'lol', 'ngakak', 'lucu', 'jahil', 'iseng', 'gokil', 'kocak', 'absurd', 'cringe', 'santai', 'random']
const SAD_KEYS      = ['sedih', 'nangis', 'susah', 'capek', 'lelah', 'down', 'galau', 'hancur', 'putus', 'kehilangan', 'ditinggal', 'pergi', 'hopeless', 'menyerah', 'berat']

function detectMood(pesan) {
    const lower = pesan.toLowerCase()
    if (ROMANTIC_KEYS.some(k => lower.includes(k))) return 'romantic'
    if (FUNNY_KEYS.some(k => lower.includes(k)))    return 'funny'
    if (SAD_KEYS.some(k => lower.includes(k)))      return 'sad'
    return 'default'
}

// ── Footer per mood ─────────────────────────────────────────────
function getFooter(mood) {
    const footers = {
        romantic: ['✨ pengirim menyembunyikan identitasnya', '🌷 pengirim menyembunyikan identitasnya', '🫶 pengirim menyembunyikan identitasnya'],
        funny:    ['😼 pengirim menyembunyikan identitasnya', '✨ pengirim menyembunyikan identitasnya', '🫶 pengirim menyembunyikan identitasnya'],
        sad:      ['🫂 pengirim menyembunyikan identitasnya', '✨ pengirim menyembunyikan identitasnya', '🌷 pengirim menyembunyikan identitasnya'],
        default:  ['✨ pengirim menyembunyikan identitasnya', '🫶 pengirim menyembunyikan identitasnya', '🌷 pengirim menyembunyikan identitasnya'],
    }
    const arr = footers[mood] || footers.default
    return arr[Math.floor(Math.random() * arr.length)]
}

// ── Format pesan menfess ─────────────────────────────────────────
function formatMenfess(targetNum, pesan, mood, usedPrefix) {
    const footer = getFooter(mood)
    return (
`╭──〔 💌 MENFESS 〕──╮

to: @${targetNum}

${pesan}

╰────────────────╯
${footer}

💬 _Balas dengan: ${usedPrefix}menfess balas <pesan>_
⏳ _Sesi balas berlaku 24 jam_`
    )
}

// ── Format pesan balasan menfess ─────────────────────────────────
function formatBalasan(pesan, mood) {
    const footer = getFooter(mood)
    return (
`╭──〔 💌 BALASAN MENFESS 〕──╮

${pesan}

╰────────────────╯
${footer}

💬 _Balas lagi dengan: .menfess balas <pesan>_`
    )
}

// ── Parse target dari teks ───────────────────────────────────────
function parseTarget(raw, mentionedJid = []) {
    if (mentionedJid && mentionedJid.length > 0) {
        return jidToNum(mentionedJid[0])
    }
    let num = raw.replace(/[^0-9]/g, '')
    if (num.startsWith('0')) num = '62' + num.slice(1)
    if (/^62\d{8,15}$/.test(num)) return num
    return null
}

// ── Session helper (simpan di global.db.data) ────────────────────
// Struktur: global.db.data.menfessSessions[targetNum] = { from: senderNum, expiry: timestamp }
const SESSION_TTL = 24 * 60 * 60 * 1000  // 24 jam

function getSessionDB() {
    if (!global.db?.data) return {}
    if (!global.db.data.menfessSessions) global.db.data.menfessSessions = {}
    return global.db.data.menfessSessions
}

function setSession(targetNum, senderNum) {
    const db = getSessionDB()
    db[targetNum] = {
        from  : senderNum,
        expiry: Date.now() + SESSION_TTL,
    }
}

function getSession(num) {
    const db   = getSessionDB()
    const sess = db[num]
    if (!sess) return null
    if (Date.now() > sess.expiry) {
        delete db[num]
        return null
    }
    return sess
}

// ── Handler utama ────────────────────────────────────────────────
let handler = async function (m, { conn, text, usedPrefix, command }) {
    // Harus DM
    if (m.isGroup) throw `❌ Fitur ini cuma bisa dipakai lewat *DM* ke bot ya~`

    // Cek teks ada
    if (!text || !text.trim()) {
        throw (
            `💌 *Cara pakai menfess:*\n\n` +
            `*Kirim menfess:*\n` +
            `  ${usedPrefix + command} <nomor/mention> <pesan>\n\n` +
            `*Balas menfess:*\n` +
            `  ${usedPrefix + command} balas <pesan>\n\n` +
            `Contoh:\n` +
            `• _${usedPrefix + command} 628xxxx haii, semangat ya! 🌷_\n` +
            `• _${usedPrefix + command} balas makasih kamu juga ya! 😊_\n\n` +
            `_Identitasmu 100% aman, gak ada yang tau siapa kamu_ ✨`
        )
    }

    const parts      = text.trim().split(/\s+/)
    const senderNum  = jidToNum(m.sender)

    // ── MODE BALAS ───────────────────────────────────────────────
    if (parts[0].toLowerCase() === 'balas') {
        const pesanBalas = parts.slice(1).join(' ').trim()

        if (!pesanBalas || pesanBalas.split(/\s+/).length < 2) {
            throw `❌ Pesannya terlalu pendek dong~ minimal 2 kata ya 😅`
        }
        if (pesanBalas.length > 500) {
            throw `❌ Pesannya kepanjangan! Maksimal 500 karakter aja~`
        }

        // Cek apakah ada sesi aktif (pernah menerima menfess)
        const sess = getSession(senderNum)
        if (!sess) {
            throw (
                `❌ *Tidak ada menfess yang bisa dibalas*\n\n` +
                `Kamu belum menerima menfess, atau waktu balasnya sudah habis _(24 jam)_ 😢`
            )
        }

        const originalSenderJid = numToJid(sess.from)
        const mood    = detectMood(pesanBalas)
        const balasan = formatBalasan(pesanBalas, mood)

        // Kirim balasan ke pengirim menfess asli (anonim)
        try {
            await conn.sendMessage(originalSenderJid, { text: balasan })
        } catch (e) {
            console.error('[MENFESS] Gagal kirim balasan:', e.message)
            throw `❌ Gagal kirim balasan. Mungkin pengirim sudah gak aktif?`
        }

        return m.reply(
            `✅ *Balasan menfess terkirim!*\n\n` +
            `_Identitasmu tetap aman, tenang aja_ 🤫✨`
        )
    }

    // ── MODE KIRIM MENFESS ───────────────────────────────────────
    if (parts.length < 2) {
        throw (
            `💌 *Cara kirim menfess:*\n\n` +
            `*${usedPrefix + command} <nomor/mention> <pesan>*\n\n` +
            `Contoh:\n` +
            `• _${usedPrefix + command} 628xxxx haii, semangat ya! 🌷_\n` +
            `• _${usedPrefix + command} @628xxxx kangen banget nih 😭_\n\n` +
            `_Identitasmu 100% aman, gak ada yang tau siapa kamu_ ✨`
        )
    }

    const rawTarget = parts[0]
    const pesan     = parts.slice(1).join(' ').trim()

    if (pesan.split(/\s+/).length < 2) {
        throw `❌ Pesannya terlalu pendek dong~ minimal 2 kata ya 😅`
    }
    if (pesan.length > 500) {
        throw `❌ Pesannya kepanjangan! Maksimal 500 karakter aja~`
    }

    const targetNum = parseTarget(rawTarget, m.mentionedJid || [])
    if (!targetNum) {
        throw (
            `❌ Nomor target gak valid nih!\n\n` +
            `Gunakan format:\n` +
            `• *628xxxxxxxxxx* (nomor lengkap)\n` +
            `• *08xxxxxxxxxx* (format lokal)\n` +
            `• *@mention* (tag langsung di pesan)`
        )
    }

    if (targetNum === senderNum) {
        throw `😅 Menfess ke diri sendiri? Kayaknya kamu butuh ngobrol sama orang lain deh~`
    }

    const targetJid = numToJid(targetNum)
    const mood      = detectMood(pesan)
    const menfess   = formatMenfess(targetNum, pesan, mood, usedPrefix)

    // Kirim ke target
    try {
        await conn.sendMessage(targetJid, {
            text    : menfess,
            mentions: [targetJid],
        })
    } catch (e) {
        console.error('[MENFESS] Gagal kirim ke target:', e.message)
        throw `❌ Gagal kirim menfess. Mungkin nomor gak aktif atau blokir bot?`
    }

    // Simpan sesi: target bisa balas ke pengirim selama 24 jam
    setSession(targetNum, senderNum)

    // Konfirmasi ke pengirim
    m.reply(
        `✅ *Menfess berhasil terkirim!*\n\n` +
        `_Target bisa membalas menfessmu selama 24 jam_ ⏳\n` +
        `_Identitasmu tetap aman, tenang aja_ 🤫✨`
    )
}

handler.help     = ['menfess <nomor/mention> <pesan>', 'menfess balas <pesan>']
handler.tags     = ['tools', 'fun']
handler.command  = /^menfess$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = true
handler.admin    = false
handler.botAdmin = false
handler.register = false
handler.limit    = true

module.exports = handler
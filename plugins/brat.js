// plugins/brat.js
// ═══════════════════════════════════════════════════════════════════
//  🎨 PLUGIN: .brat — Generator Stiker Brat
//  API  : https://api.erhabot.com/api/maker/brat?text=...&apikey=...
//  Limit: 100 pemakaian per hari (reset tengah malam)
// ═══════════════════════════════════════════════════════════════════

'use strict'

const fetch = typeof globalThis.fetch === 'function'
    ? globalThis.fetch
    : require('node-fetch')

const { sticker4, addExif } = require('../lib/sticker')
const { getDbUser }         = require('../lib/jidUtils')

// ── Konfigurasi ───────────────────────────────────────────────────
const BRAT_API_KEY  = 'rh_2e12bfa0d10ed15320dad811d4rhbotc'
const BRAT_API_URL  = 'https://api.erhabot.com/api/maker/brat'
const BRAT_MAX_DAY  = 100          // limit pemakaian per hari
const BRAT_KEY      = 'bratUsage'  // key di global.db.data

// ── Helper: ambil/init data usage ────────────────────────────────
function getUsageData() {
    if (!global.db.data[BRAT_KEY]) global.db.data[BRAT_KEY] = {}
    return global.db.data[BRAT_KEY]
}

/**
 * Cek & increment counter harian bot-level
 * Return { count, isOver } setelah increment
 * Reset otomatis jika sudah beda hari (midnight reset)
 */
function tickDailyUsage() {
    const data   = getUsageData()
    const now    = new Date()
    // Format YYYY-MM-DD sebagai key hari
    const today  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Reset jika hari berbeda
    if (data.date !== today) {
        data.date  = today
        data.count = 0
    }

    data.count = (data.count || 0) + 1
    return { count: data.count, isOver: data.count > BRAT_MAX_DAY }
}

function peekDailyUsage() {
    const data   = getUsageData()
    const now    = new Date()
    const today  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    if (data.date !== today) return 0
    return data.count || 0
}

// ── Handler ───────────────────────────────────────────────────────
let handler = async function (m, { conn, args, usedPrefix, command }) {

    // ── Cek teks input ────────────────────────────────────────────
    const text = args.join(' ').trim()
    if (!text) throw (
        `❌ Masukkan teks untuk stiker brat!\n\n` +
        `Contoh: *${usedPrefix + command} nama kamu*`
    )

    if (text.length > 100) throw '❌ Teks terlalu panjang! Maksimal 100 karakter.'

    // ── Cek limit harian global (berlaku untuk semua user tanpa terkecuali) ──
    const currentUsage = peekDailyUsage()
    if (currentUsage >= BRAT_MAX_DAY) {
        throw (
            `🚫 *Limit harian fitur brat sudah habis!*\n\n` +
            `📊 Pemakaian hari ini: *${currentUsage}/${BRAT_MAX_DAY}*\n` +
            `⏳ Limit akan reset tengah malam.`
        )
    }

    // ── React loading ─────────────────────────────────────────────
    await conn.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })

    // ── Fetch gambar brat dari API ────────────────────────────────
    const url      = `${BRAT_API_URL}?text=${encodeURIComponent(text)}&apikey=${BRAT_API_KEY}`
    let   imgBuf

    try {
        const res = await Promise.race([
            fetch(url),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
        ])

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const contentType = res.headers.get('content-type') || ''
        if (!contentType.includes('image')) {
            // Coba parse sebagai JSON — mungkin return error message
            const json = await res.json().catch(() => null)
            const msg  = json?.message || json?.error || 'Format response tidak dikenal'
            throw new Error(msg)
        }

        imgBuf = Buffer.from(await res.arrayBuffer())
    } catch (e) {
        throw `❌ Gagal fetch gambar brat: ${e.message}`
    }

    // ── Convert ke stiker WebP ────────────────────────────────────
    const packname = global.packname || global.wm || global.namabot || 'ShiraoriBOT'
    const author   = global.author   || global.wm || 'ShiraoriBOT'

    let stickerBuf
    try {
        const result = await (global.queueManager
            ? global.queueManager.add('media', () => sticker4(imgBuf, false))
            : sticker4(imgBuf, false)
        )
        const webp = Buffer.isBuffer(result) ? result : result?.data
        if (!webp) throw new Error('sticker4 tidak menghasilkan output')

        try {
            stickerBuf = await addExif(webp, packname, author)
        } catch (_) {
            stickerBuf = webp
        }
    } catch (e) {
        throw `❌ Gagal konversi ke stiker: ${e.message}`
    }

    // ── Kirim stiker ──────────────────────────────────────────────
    await conn.sendMessage(m.chat, { sticker: stickerBuf }, { quoted: m })

    // ── Increment counter global & kirim info pemakaian ─────────────
    const { count } = tickDailyUsage()
    await global.db.write().catch(() => {})

    const sisa    = BRAT_MAX_DAY - count
    const barFill = Math.round((count / BRAT_MAX_DAY) * 10)
    const bar     = '▓'.repeat(barFill) + '░'.repeat(10 - barFill)

    const countMsg = (
        `📊 *Pemakaian Fitur Brat Hari Ini*\n` +
        `${bar}\n` +
        `*${count}/${BRAT_MAX_DAY}* pemakaian` +
        (sisa <= 10 && sisa > 0
            ? `\n⚠️ Sisa *${sisa}* pemakaian lagi!`
            : sisa === 0
                ? `\n🚫 Limit hari ini *habis*! Reset tengah malam.`
                : ''
        )
    )

    await conn.sendMessage(m.chat, { text: countMsg }, { quoted: m })
}

// ── Metadata plugin ───────────────────────────────────────────────
handler.help     = ['brat <teks> - buat stiker brat']
handler.tags     = ['maker', 'tools']
handler.command  = /^brat$/i

handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.register = false
handler.exp      = 3
handler.limit    = 2

module.exports = handler
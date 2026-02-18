// menu.js - Menu Bot, gambar + semua fitur langsung

let levelling = require('../lib/levelling')
let fs        = require('fs')
let path      = require('path')
let moment    = require('moment-timezone')
let fetch     = require('node-fetch')

async function resolvePinterest(url) {
    // Pinterest shortlink (pin.it) → redirect ke halaman pin → ambil URL gambar dari og:image
    try {
        // Step 1: Ikuti redirect pin.it → dapat URL pinterest.com/pin/...
        const r1 = await fetch(url, {
            timeout: 10000,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        })
        const html = await r1.text()
        // Step 2: Cari URL gambar dari meta og:image
        const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
        if (match && match[1]) {
            const imgUrl = match[1].replace(/&amp;/g, '&')
            const r2 = await fetch(imgUrl, { timeout: 10000 })
            if (r2.ok) return await r2.buffer()
        }
    } catch (_) {}
    return null
}

async function getImageBuffer() {
    // Prioritas 1: Gambar lokal menu_bg (simpan manual dari Pinterest)
    const menuBg = path.join(__dirname, '../media/menu_bg.jpg')
    if (fs.existsSync(menuBg)) return fs.readFileSync(menuBg)

    // Prioritas 2: Resolve Pinterest shortlink (pin.it/49ySbNKvj)
    const pintUrl = 'https://pin.it/49ySbNKvj'
    const fromPint = await resolvePinterest(pintUrl)
    if (fromPint) {
        // Cache ke lokal agar request berikutnya tidak perlu fetch lagi
        try { fs.writeFileSync(menuBg, fromPint) } catch (_) {}
        return fromPint
    }

    // Prioritas 3: URL global.media (kalau bukan Pinterest)
    if (global.media && !global.media.includes('pin.it') && !global.media.includes('pinterest')) {
        try {
            const res = await fetch(global.media, { timeout: 8000 })
            if (res.ok) return await res.buffer()
        } catch (_) {}
    }

    // Prioritas 4: Gambar lokal fallback
    const locals = [
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of locals) {
        if (fs.existsSync(p)) return fs.readFileSync(p)
    }
    return null
}

function clockString(ms) {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    return `${h}j ${m}m ${s}d`
}

function ucapan() {
    const jam = moment.tz('Asia/Jakarta').hour()
    if (jam >= 18) return '🌙 Malam'
    if (jam >= 15) return '🌆 Sore'
    if (jam >= 11) return '☀️ Siang'
    if (jam >= 4)  return '🌅 Pagi'
    return '🌃 Dinihari'
}

// Label nama kategori per tag
const TAG_LABEL = {
    'main'      : '🏠 UTAMA',
    'game'      : '🎮 GAME',
    'rpg'       : '⚔️ RPG',
    'xp'        : '⭐ EXP & LIMIT',
    'premium'   : '💎 PREMIUM',
    'group'     : '👥 GRUP',
    'owner'     : '👑 OWNER',
    'host'      : '🖥️ HOST',
    'fun'       : '😄 FUN',
    'sticker'   : '🎭 STIKER',
    'internet'  : '🌐 INTERNET',
    'downloader': '📥 DOWNLOADER',
    'tools'     : '🔧 TOOLS',
    'info'      : 'ℹ️ INFO',
    'anime'     : '🌸 ANIME',
    'nsfw'      : '🔞 NSFW',
    'quotes'    : '💬 QUOTES',
    'audio'     : '🎵 AUDIO',
    'advanced'  : '⚙️ ADVANCED',
    ''          : '📌 LAINNYA',
}

// ═══════════════════════════════════════════════════════════
let handler = async (m, { conn, usedPrefix: _p }) => {

    let pkg = {}
    try { pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'))) } catch (_) {}

    const userData = global.db.data.users[m.sender] || {}
    const { exp = 0, limit = 10, premium = false, level = 0, role = 'Beginner', registered = false, money = 0 } = userData
    const { min, xp, max } = levelling.xpRange(level, global.multiplier || 1)

    const name    = registered ? (userData.name || conn.getName(m.sender)) : conn.getName(m.sender)
    const uptime  = clockString(process.uptime() * 1000)
    const mode    = global.opts['self'] ? 'Self' : 'Publik'
    const botName = global.namabot || 'ShiraoriBOT'
    const wm      = global.wm || botName
    const salam   = ucapan()

    const totalUser = Object.keys(global.db.data.users).length

    // ── Kumpulkan semua plugin dan kelompokkan per tag ─────────────────
    const pluginList = Object.values(global.plugins).filter(p => !p.disabled && p.help && p.tags)

    // Kumpulkan semua tag unik yang ada di plugin (urutan kemunculan)
    const tagOrder = []
    for (const p of pluginList) {
        const tags = Array.isArray(p.tags) ? p.tags : [p.tags]
        for (const t of tags) {
            if (!tagOrder.includes(t)) tagOrder.push(t)
        }
    }

    // Bangun menu per tag
    let menuSection = ''
    let totalCmd = 0

    for (const tag of tagOrder) {
        const cmds = pluginList.filter(p => {
            const tags = Array.isArray(p.tags) ? p.tags : [p.tags]
            return tags.includes(tag)
        })
        if (!cmds.length) continue

        const label = TAG_LABEL[tag] || `📁 ${tag.toUpperCase()}`
        menuSection += `╭─── ${label}\n`

        for (const plugin of cmds) {
            const helps = Array.isArray(plugin.help) ? plugin.help : [plugin.help]
            for (const cmd of helps) {
                let line = `│  ◈ ${plugin.prefix ? cmd : _p + cmd}`
                if (plugin.limit)   line += ' ⚡'
                if (plugin.premium) line += ' 💎'
                menuSection += line + '\n'
                totalCmd++
            }
        }
        menuSection += `╰──────────────────────────\n\n`
    }

    // ── Susun teks lengkap ─────────────────────────────────────────────
    const caption =
`╔══════════════════╗
║  🤖  ${botName.slice(0, 18).padEnd(18)}         ║
╚══════════════════╝

${salam}, *${name}*!

╭─── 📊 *INFO BOT*
│  ⏱️ Uptime : ${uptime}
│  🔌 Mode   : ${mode}
│  🧩 Fitur  : ${totalCmd} perintah
│  👥 User   : ${totalUser} terdaftar
╰──────────────────────────

╭─── 👤 *INFO KAMU*
│  ⭐ Level  : ${level} — ${role}
│  📈 EXP    : ${exp.toLocaleString('id-ID')}
│  🎯 Limit  : ${limit}
│  💰 Uang   : ${Number(money).toLocaleString('id-ID')}
│  💎 Status : ${premium ? '✨ Premium' : '🆓 Free'}
╰──────────────────────────

${menuSection}⚡ = Butuh limit  💎 = Premium
_${wm}_`

    // ── Kirim dengan gambar ────────────────────────────────────────────
    const imgBuf = await getImageBuffer()

    if (imgBuf) {
        try {
            return await conn.sendMessage(m.chat, {
                image: imgBuf,
                caption,
                mimetype: 'image/jpeg',
            }, { quoted: m })
        } catch (_) {}
    }

    // Fallback teks biasa
    return m.reply(caption)
}

handler.help     = ['menu', 'help', '?']
handler.tags     = ['main']
handler.command  = /^(menu|help|\?)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.fail     = null
handler.exp      = 3

module.exports = handler
// plugins/menu.js — Menu utama bot + gambar + tombol interaktif
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()

const levelling = require('../lib/levelling')
const fs        = require('fs')
const path      = require('path')
const moment    = require('moment-timezone')
const fetch     = require('node-fetch')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys')
const { numToJid, jidToNum, getDbUser } = require('../lib/jidUtils')
let cachedMenuImage

async function resolvePinterest(url) {
    try {
        const r1 = await fetch(url, {
            timeout: 10000,
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        })
        const html  = await r1.text()
        const match = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                   || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
        if (match?.[1]) {
            const imgUrl = match[1].replace(/&amp;/g, '&')
            const r2 = await fetch(imgUrl, { timeout: 10000 })
            if (r2.ok) return await r2.buffer()
        }
    } catch (_) {}
    return null
}

async function getImageBuffer() {
    const menuBg = path.join(__dirname, '../media/menu_bg.jpg')
    if (cachedMenuImage !== undefined) return cachedMenuImage
    if (fs.existsSync(menuBg)) {
        cachedMenuImage = fs.readFileSync(menuBg)
        return cachedMenuImage
    }

    const fromPint = await resolvePinterest('https://pin.it/49ySbNKvj')
    if (fromPint) {
        try { fs.writeFileSync(menuBg, fromPint) } catch (_) {}
        cachedMenuImage = fromPint
        return cachedMenuImage
    }

    if (global.media && !global.media.includes('pin.it') && !global.media.includes('pinterest')) {
        try {
            const res = await fetch(global.media, { timeout: 8000 })
            if (res.ok) {
                cachedMenuImage = await res.buffer()
                return cachedMenuImage
            }
        } catch (_) {}
    }

    for (const p of [path.join(__dirname, '../media/shiraori.jpg'), path.join(__dirname, '../media/esce.jpg')]) {
        if (fs.existsSync(p)) {
            cachedMenuImage = fs.readFileSync(p)
            return cachedMenuImage
        }
    }
    cachedMenuImage = null
    return cachedMenuImage
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

const TAG_LABEL = {
    'main'      : '🏠 UTAMA',
    'game'      : '🎮 GAME',
    'keluarga'  : '👰🤵 KELUARGA',
    'kriminal'  : '🥷 KRIMINAL', 
    'tensura'    : '👹 TENSURA',
    'rpg'       : '⚔️ RPG',
    'market'    : '🛒 MARKET',
    'fantasy'   : '🔮 FANTASY',
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

const TAG_ORDER_PRIORITY = [
    'keluarga', 'kriminal', 'tensura', 'rpg', 'market', 'ekonomi', 'game', 'fantasy',
    'main', 'xp', 'fun', 'sticker', 'tools', 'internet', 'downloader',
    'audio', 'anime', 'info', 'quotes', 'group', 'premium', 'host',
    'advanced', 'nsfw', 'owner', '',
]

// ════════════════════════════════════════════════════════════════════
let handler = async (m, { conn, usedPrefix: _p }) => {

    const userData = getDbUser(m.sender) || {}
    const { exp = 0, limit = 10, level = 0, role = 'Beginner', registered = false, money = 0 } = userData

    const senderNum = m.sender.split('@')[0].split(':')[0]
    const premNums  = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
    const premium   = userData.premium === true || premNums.includes(senderNum)

    const name      = registered ? (userData.name || conn.getName(m.sender)) : conn.getName(m.sender)
    const uptime    = clockString(process.uptime() * 1000)
    const mode      = global.opts['self'] ? 'Self' : 'Publik'
    const botName   = global.namabot || 'ShiraoriBOT'
    const wm        = global.wm || botName
    const salam     = ucapan()
    const totalUser = Object.keys(global.db.data.users || {}).length
    const pluginList = Object.values(global.plugins).filter(p => !p.disabled && p.help && p.tags)

    const tagOrder = [...TAG_ORDER_PRIORITY]
    for (const p of pluginList) {
        const tags = Array.isArray(p.tags) ? p.tags : [p.tags]
        for (const t of tags) { if (!tagOrder.includes(t)) tagOrder.push(t) }
    }

    let menuSection = ''
    let totalCmd    = 0

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

    const caption =
`╔══════════════╗
║ 🕷️ ${botName.slice(0, 18).padEnd(18)}║
╚══════════════╝

${salam}, *${name}*!

╭─── 📊 *INFO BOT*
│  ⏱️ Uptime : ${uptime}
│  🔌 Mode   : ${mode}
│  🧩 Fitur  : ${totalCmd} perintah
│  👥 User   : ${totalUser} terdaftar
│  📌 Info   : .infobot
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

    const imgBuf = await getImageBuffer()

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💖 Donasi', id: `${_p}donasi`    }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏦 Bank',   id: `${_p}bank`  }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Owner',  id: `${_p}owner` }) },
    ]

    try {
        let header

        if (imgBuf) {
            try {
                const uploaded = await prepareWAMessageMedia(
                    { image: imgBuf },
                    { upload: conn.waUploadToServer }
                )
                header = proto.Message.InteractiveMessage.Header.create({
                    ...uploaded,
                    hasMediaAttachment: true,
                })
            } catch (e) {
                console.error('[menu] prepareWAMessageMedia gagal:', e.message)
                header = { title: botName, hasMediaAttachment: false }
            }
        } else {
            header = { title: botName, hasMediaAttachment: false }
        }

        const msg = generateWAMessageFromContent(
            m.chat,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {},
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            header,
                            body  : { text: caption },
                            footer: { text: wm },
                            nativeFlowMessage: { buttons },
                        }),
                    },
                },
            },
            { userJid: conn.user.id, quoted: m }
        )

        return await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })

    } catch (e) {
        console.error('[menu] gagal kirim interactive:', e.message)
        // Fallback: gambar + caption tanpa tombol
        try {
            if (imgBuf) {
                return await conn.sendMessage(m.chat, { image: imgBuf, caption, mimetype: 'image/jpeg' }, { quoted: m })
            }
        } catch (_) {}
        // Last resort: teks saja
        return m.reply(caption)
    }
}

handler.help     = ['menu', 'help', '?']
handler.tags     = ['main']
handler.command  = /^(menu|help|\?)$/i
handler.owner    = false
handler.register = true
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.fail     = null
handler.exp      = 3

module.exports = handler

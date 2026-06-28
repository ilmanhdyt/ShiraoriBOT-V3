// plugins/menu.js — Menu utama bot (teks biasa, tanpa gambar/button)

const levelling = require('../lib/levelling')
const moment    = require('moment-timezone')
const { getDbUser } = require('../lib/jidUtils')

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
    'roleplay'  : '🎭 ROLEPLAY', 
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
    'roleplay', 'keluarga', 'kriminal', 'tensura', 'rpg', 'market', 'ekonomi', 'game', 'fantasy',
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

    return conn.sendMessage(m.chat, { text: caption }, { quoted: m })
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
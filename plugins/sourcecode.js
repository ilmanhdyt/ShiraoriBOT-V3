// plugins/sourcecode.js — Info source code + tombol navigasi
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()
/**
 * jangan ganti ya kakak kakak sekalian
 * ini cuma buat ninggalin credit gw doang :)
 **/


let fs = require('fs')
const { resolveTargetUser } = require('../lib/resolveTarget')
const { numToJid, getDbUser, jidToNum } = require('../lib/jidUtils')

let handler = async (m, { conn, args = [], participants = [] }) => {
    const target = resolveTargetUser({ m, args, conn, participants, candidate: args[0] })
    const who = target?.jid || m.sender

    const decoded = conn.decodeJid(who)

    let user = getDbUser(decoded)
    if (!user) {
        const num = decoded.split('@')[0].split(':')[0]
        for (const key of Object.keys(global.db.data.users || {})) {
            if (key.split('@')[0].split(':')[0] === num) {
                user = global.db.data.users?.[key]
                break
            }
        }
    }

    if (!user) return m.reply('❌ Data user tidak ditemukan!')

    const num      = decoded.split('@')[0].split(':')[0]
    const premNums = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
    const isPrem   = user.premium === true || premNums.includes(num)

    const name  = user.name  || conn.getName(who) || 'Unknown'
    const limit = user.limit ?? 10
    const money = Number(user.money || 0).toLocaleString('id-ID')
    const exp   = Number(user.exp   || 0).toLocaleString('id-ID')
    const level = user.level || 0
    const role  = user.role  || 'Beginner'
    const bank  = Number(user.bank  || 0).toLocaleString('id-ID')

    const caption =
`╭─〔 SOURCE CODE 〕
│ 
│ 🤖 Bot      : ShiraoriBOT
│ 👨‍💻 Dev     : Iyam
│ 
│ 📂 Repository
│ github.com/ilmanhdyt/shiraoribot-v3
│ 
│ 📌 Language  : JavaScript (ES6+)
│ 📦 Library   : shiraori-baileys
│ 🗄️ Database  : JSON Local
│ 
│ ⭐ Jangan lupa kasih bintang!
╰──────────────

👑 Owner : wa.me/6281351047727
📂 Repo  : github.com/ilmanhdyt/shiraoribot-v3
`
    return conn.sendMessage(m.chat, { text: caption }, { quoted: m })
}

handler.help    = ['sc', 'sourcecode']
handler.tags    = ['info']
handler.command = /^(sc|sourcecode)$/i

module.exports = handler
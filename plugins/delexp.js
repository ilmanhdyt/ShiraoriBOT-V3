const { resolveTargetUser } = require('../lib/resolveTarget')
const { numToJid, getDbUser, jidToNum } = require('../lib/jidUtils')

let handler = async (m, { conn, text = '', usedPrefix, participants = [] }) => {
    let who
    let amount

    const args = text.trim().split(/\s+/).filter(Boolean)

    if (m.isGroup) {
        const target = resolveTargetUser({ m, args, conn, participants, candidate: args[0] })
        who = target?.jid || null
        amount = parseInt(args.find(arg => /^\d+$/.test(arg)), 10) || 0
    } else {
        who = m.sender
        amount = parseInt(args[0], 10) || 0
    }

    if (!who) {
        return m.reply(
            `❌ Tag/reply/nomor siapa yang mau dikurangi EXP!\n` +
            `Contoh:\n` +
            `• *${usedPrefix}delexp @user 100*\n` +
            `• *${usedPrefix}delexp 6281xxxx 100*\n` +
            `• reply pesan user lalu *${usedPrefix}delexp 100*`
        )
    }
    if (!amount || amount <= 0) return m.reply(`❌ Masukkan jumlah EXP yang valid!\nContoh: *${usedPrefix}delexp @user 100*`)
    if (amount > 999999) return m.reply('❌ Maksimal kurangi EXP 999.999 sekaligus!')

    const decoded = conn.decodeJid(who)
    const num = decoded.split('@')[0].split(':')[0]

    let userKey = null
    for (const key of Object.keys(global.db.data.users || {})) {
        if (key.split('@')[0].split(':')[0] === num) {
            userKey = key
            break
        }
    }

    if (!userKey) return m.reply('❌ User tidak ditemukan di database!')

    const user = getDbUser(userKey)
    const expLama = user.exp || 0

    user.exp = Math.max(expLama - amount, 0)
    const berkurang = expLama - user.exp

    const name = conn.getName(who) || num

    m.reply(
        `✅ *Berhasil kurangi EXP!*\n\n` +
        `👤 User  : ${name}\n` +
        `📉 EXP   : ${expLama.toLocaleString('id-ID')} -> ${user.exp.toLocaleString('id-ID')}\n` +
        `➖ Kurang: -${berkurang.toLocaleString('id-ID')} EXP${expLama < amount ? '\n⚠️ EXP tidak bisa minus, di-set ke 0' : ''}`
    )
}

handler.help = ['delexp [@user/reply/nomor] [jumlah]']
handler.tags = ['owner']
handler.command = /^delexp$/i
handler.owner = true

module.exports = handler

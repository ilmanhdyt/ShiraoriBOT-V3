const { resolveTargetUser } = require('../lib/resolveTarget')
const { jidToNum } = require('../lib/jidUtils')

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
            `❌ Tag/reply/nomor siapa yang mau ditambah EXP!\n` +
            `Contoh:\n` +
            `• *${usedPrefix}addexp @user 100*\n` +
            `• *${usedPrefix}addexp 6281xxxx 100*\n` +
            `• reply pesan user lalu *${usedPrefix}addexp 100*`
        )
    }
    if (!amount || amount <= 0) return m.reply(`❌ Masukkan jumlah EXP yang valid!\nContoh: *${usedPrefix}addexp @user 100*`)
    if (amount > 999999) return m.reply('❌ Maksimal tambah EXP 999.999 sekaligus!')

    const decoded = conn.decodeJid(who)
    const num = decoded.split('@')[0].split(':')[0]

    if (!global.db.data.users) global.db.data.users = {}

    let userKey = null
    for (const key of Object.keys(global.db.data.users || {})) {
        if (key.split('@')[0].split(':')[0] === num) {
            userKey = key
            break
        }
    }

    if (!userKey) {
        userKey = num
        global.db.data.users[num] = { exp: 0, level: 0, role: 'Beginner' }
    }

    const dbKey = jidToNum(userKey)
    const user = global.db.data.users?.[dbKey]
    if (!user) return m.reply('❌ Gagal menemukan user di database!')

    const expLama = user.exp || 0
    user.exp = expLama + amount

    const name = conn.getName(who) || num

    m.reply(
        `✅ *Berhasil tambah EXP!*\n\n` +
        `👤 User  : ${name}\n` +
        `📈 EXP   : ${expLama.toLocaleString('id-ID')} -> ${user.exp.toLocaleString('id-ID')}\n` +
        `➕ Tambah: +${amount.toLocaleString('id-ID')} EXP`
    )
}

handler.help = ['addexp [@user/reply/nomor] [jumlah]']
handler.tags = ['owner']
handler.command = /^addexp$/i
handler.owner = true

module.exports = handler

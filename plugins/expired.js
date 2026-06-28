// expired.js - Cek sisa waktu sewa grup
// Hanya ubah format Sisa Waktu dan Expired agar sinkron dengan addsewa.js

function msToDate(ms) {
    if (ms <= 0) return '0 detik'
    const days    = Math.floor(ms / 86400000)
    const hours   = Math.floor((ms % 86400000) / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    let parts = []
    if (days)    parts.push(`${days} hari`)
    if (hours)   parts.push(`${hours} jam`)
    if (minutes) parts.push(`${minutes} menit`)
    if (seconds) parts.push(`${seconds} detik`)
    return parts.join(' ') || '0 detik'
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const who = m.isGroup ? m.chat
        : args[0] ? (args[0].includes('@') ? args[0] : args[0].replace(/[^0-9]/g, '') + '@g.us')
        : null

    if (!who) throw `Masukkan ID grup!\n*Contoh: ${usedPrefix}expired 120363xxxxxx@g.us*`

    const chat = global.db.data.chats?.[who]
    const now  = Date.now()

    if (!chat?.expired || chat.expired <= now) {
        return m.reply(`❌ *Grup ini tidak memiliki masa sewa aktif.*\n\nTambah sewa: *${usedPrefix}addsewa <link/id> <hari>*`)
    }

    const sisaMs  = chat.expired - now
    const expDate = new Date(chat.expired).toLocaleString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    })

    return m.reply(
        `╭─「 ⏳ *SEWA BOT* 」\n` +
        `│\n` +
        `│  📋 *Grup:* ${who}\n` +
        `│  ✅ *Status:* Aktif\n` +
        `│\n` +
        `│  ⏱️ *Sisa Waktu:*\n` +
        `│  ${msToDate(sisaMs)}\n` +
        `│\n` +
        `│  📅 *Expired:* ${expDate}\n` +
        `│\n` +
        `╰─────────────────`
    )
}

handler.help    = ['expired']
handler.tags    = ['main', 'group']
handler.command = /^(expired)$/i
handler.group   = true

module.exports = handler
let handler = async (m, { conn, usedPrefix }) => {
    const ms      = process.uptime() * 1000
    const days    = Math.floor(ms / 86400000)
    const hours   = Math.floor(ms / 3600000) % 24
    const minutes = Math.floor(ms / 60000) % 60
    const seconds = Math.floor(ms / 1000) % 60

    const parts = []
    if (days)    parts.push(`${days} hari`)
    if (hours)   parts.push(`${hours} jam`)
    if (minutes) parts.push(`${minutes} menit`)
    parts.push(`${seconds} detik`)

    const botName = global.namabot || 'ShiraoriBOT'

    m.reply(
        `⏱️ *Runtime ${botName}*\n\n` +
        `🟢 Bot sudah aktif selama:\n` +
        `*${parts.join(' ')}*`
    )
}

handler.help    = ['runtime', 'uptime']
handler.tags    = ['info']
handler.command = /^(runtime|uptime)$/i
handler.owner   = false

module.exports = handler
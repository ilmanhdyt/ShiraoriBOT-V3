let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw (
        `📢 *Cara Lapor ke Owner*\n\n` +
        `Gunakan perintah ini jika kamu menemukan error atau ingin request fitur.\n\n` +
        `Contoh:\n` +
        `*${usedPrefix + command} selamat siang owner, saya menemukan error seperti berikut...*`
    )
    if (text.length < 10)   throw '❌ Laporan terlalu pendek, minimal 10 karakter!'
    if (text.length > 1000) throw '❌ Laporan terlalu panjang, maksimal 1000 karakter!'

    const ownerJid = (global.owner?.[0] || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    if (!ownerJid || ownerJid === '@s.whatsapp.net') throw '❌ Owner belum diset di config!'

    const senderNum  = m.sender.split('@')[0]
    const senderName = conn.getName(m.sender) || senderNum
    const type       = command.toLowerCase() === 'request' ? '📩 REQUEST' : '🚨 REPORT'
    const time       = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })

    const teks =
`${type}

👤 *Dari* : @${senderNum}
📱 *Nomor*: ${senderNum}
🕐 *Waktu*: ${time}

💬 *Pesan*:
${text}${m.quoted ? `\n\n📎 *Pesan dikutip*:\n${m.quoted.text || '[media]'}` : ''}`

    const LOG_GROUP = '120363407596132234@g.us'

    try {
        await conn.sendMessage(ownerJid, {
            text    : teks,
            mentions: [m.sender]
        })
    } catch (e) {
        console.log('[REPORT] Gagal kirim ke owner:', e.message)
        throw '❌ Gagal mengirim laporan. Coba lagi nanti!'
    }

    try {
        await conn.sendMessage(LOG_GROUP, {
            text    : teks,
            mentions: [m.sender]
        })
    } catch (e) {
        console.log('[REPORT] Gagal kirim ke grup log:', e.message)
    }

    m.reply(
        `✅ *Laporan terkirim ke owner!*\n\n` +
        `_Jika ${command.toLowerCase()} hanya iseng, tidak akan ditanggapi._`
    )
}

handler.help    = ['report <pesan>', 'request <pesan>']
handler.tags    = ['info']
handler.command = /^(report|request)$/i
handler.limit   = true
handler.private = true

module.exports = handler
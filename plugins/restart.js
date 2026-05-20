// plugins/restart.js
// Restart bot langsung dari WhatsApp — khusus owner
// Panel Pterodactyl/PM2 akan otomatis restart setelah process exit

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply('❌ Command ini hanya untuk *owner*!')

    await conn.reply(m.chat,
        `🔄 *Bot sedang restart...*\n\n` +
        `⏳ Tunggu 5–15 detik\n` +
        `_Bot akan online kembali otomatis_`,
        m
    )

    // Kasih waktu pesan terkirim dulu
    setTimeout(() => process.exit(0), 2000)
}

handler.help    = ['restart - restart bot']
handler.tags    = ['owner']
handler.command = /^restart$/i
handler.owner   = true

module.exports = handler
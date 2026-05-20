// infobot.js - Informasi tentang bot
// Baileys: atexovi-baileys

let handler = async (m, { conn }) => {
    const botName  = global.namabot  || 'ShiraoriBOT'
    const author   = global.author   || 'Ilmanhdyt'
    const lokasi   = global.lokasi   || 'Indonesia'
    const prefix   = '.'

    // Uptime bot
    const uptimeMs  = Date.now() - global.timestamp.start
    const uptimeStr = msToUptime(uptimeMs)

    // Jumlah plugin
    const totalPlugin = Object.keys(global.plugins || {}).length

    // Jumlah user & grup di database
    const totalUser  = Object.keys(global.db.data.users  || {}).length
    const totalGrup  = Object.keys(global.db.data.chats  || {}).length

       // Hitung total command dari semua plugin
    let totalCmd = 0
    for (const plugin of Object.values(plugins)) {
        if (!plugin || plugin.disabled || !plugin.help) continue
        const helps = Array.isArray(plugin.help) ? plugin.help : [plugin.help]
        totalCmd += helps.length
    }

    const teks = `
╭─「 🤖 *INFO BOT* 」
│
│  📛 *Nama:* ${botName}
│  👨‍💻 *Developer:* ${author}
│  📍 *Lokasi:* ${lokasi}
│  🔧 *Prefix:* ${prefix}
│
├─「 📊 *Statistik* 」
│
│  🧩 *Plugin:* ${totalPlugin} fitur
│  🔧 *Total Fitur:* ${totalCmd} command
│  👥 *Pengguna:* ${totalUser} user
│  🏘️ *Grup:* ${totalGrup} grup
│  ⏱️ *Uptime:* ${uptimeStr}
│
├─「 🎮 *Tentang Bot* 」
│
│  ${botName} adalah bot WhatsApp yang
│  berfokus pada fitur *game interaktif*
│  di dalam grup. Dirancang untuk membuat
│  grupmu makin seru & aktif!
│
├─「 🕹️ *Fitur Game* 」
│
│  ⚔️  Sistem RPG & Dungeon
│  🎣  Fishing & Hunting
│  ⛏️  Mining & Crafting
│  🐾  Pet System
│  🏆  Leaderboard & Level
│  💰  Ekonomi & Trading
│  🎲  Mini Games Seru
│
├─「 📞 *Kontak* 」
│
│  👤 *Owner:* @${(global.owner[0] || '').replace(/[^0-9]/g, '')}
│  🔗 *IG:* ${global.urlnya || '-'}
│
╰─────────────────
`.trim()

    await conn.sendMessage(m.chat, {
        text: teks,
        contextInfo: {
            mentionedJid: [global.owner[0]?.replace(/[^0-9]/g, '') + '@s.whatsapp.net']
        }
    }, { quoted: m })
}

handler.help    = ['infobot']
handler.tags    = ['info']
handler.command = /^(infobot|botinfo|about)$/i
handler.owner   = false
handler.mods    = false
handler.premium = false
handler.group   = false
handler.private = false
handler.admin   = false
handler.botAdmin = false
handler.exp     = 3

module.exports = handler

function msToUptime(ms) {
    const d = Math.floor(ms / (24 * 60 * 60 * 1000))
    const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const m = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
    return `${d} hari ${h} jam ${m} menit`
}
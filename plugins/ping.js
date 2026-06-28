// plugins/ping.js — Cek kecepatan respons bot
// Usage: .ping

const os = require('os')

function getStatus(ms) {
    if (ms < 300)  return '🟢 Sangat Cepat'
    if (ms < 700)  return '🟡 Normal'
    if (ms < 1500) return '🟠 Lambat'
    return '🔴 Sangat Lambat'
}

function formatUptime(ms) {
    const d = Math.floor(ms / 86400000)
    const h = Math.floor(ms / 3600000) % 24
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    const parts = []
    if (d) parts.push(`${d}h`)
    if (h) parts.push(`${h}j`)
    if (m) parts.push(`${m}m`)
    parts.push(`${s}d`)
    return parts.join(' ')
}

let handler = async (m, { conn }) => {
    const start    = Date.now()
    const botName  = global.namabot || 'ShiraoriBOT'
    const uptime   = formatUptime(process.uptime() * 1000)

    // RAM usage
    const totalMem = os.totalmem()
    const freeMem  = os.freemem()
    const usedMem  = totalMem - freeMem
    const ramPct   = ((usedMem / totalMem) * 100).toFixed(1)
    const ramUsed  = (usedMem / 1024 / 1024).toFixed(0)
    const ramTotal = (totalMem / 1024 / 1024).toFixed(0)

    // Kirim pesan awal dulu
    const sent = await conn.sendMessage(m.chat, {
        text: '📡 _Mengukur kecepatan..._'
    }, { quoted: m })

    // Hitung waktu setelah pesan terkirim
    const ping   = Date.now() - start
    const status = getStatus(ping)

    const text =
`╔══════════════════╗
║  📡 *PING - ${botName}*
╚══════════════════╝

⚡ *Respons :* \`${ping} ms\`
${status}

╭─── 📊 *Info Sistem*
│  ⏱️ Uptime : ${uptime}
│  🧠 RAM    : ${ramUsed} MB / ${ramTotal} MB (${ramPct}%)
│  🖥️ OS     : ${os.platform()} ${os.arch()}
│  🔧 Node   : ${process.version}
╰──────────────────────

_${global.wm || botName}_`

    // Edit pesan dengan hasil ping
    await conn.sendMessage(m.chat, {
        text,
        edit: sent.key
    })
}

handler.help    = ['ping']
handler.tags    = ['info']
handler.command = /^ping$/i
handler.owner   = false
handler.register = false

module.exports = handler
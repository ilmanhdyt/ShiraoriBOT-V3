// perpanjang.js - Perpanjang sewa grup dari sisa waktu yang ada
// Command: .perpanjang <link/id/kosong> <hari>

// ─── Helper: ms → string waktu ───────────────────────────────────────────────
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

// ─── Helper: resolve JID dari link/angka/JID ─────────────────────────────────
async function resolveGroupId(conn, input) {
    if (!input) return null
    input = input.trim()
    if (input.endsWith('@g.us')) return input
    if (/^\d+$/.test(input)) return input + '@g.us'
    const linkMatch = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
    if (linkMatch) {
        try {
            const info = await conn.groupGetInviteInfo(linkMatch[1])
            if (info?.id) return info.id
        } catch (e) {
            throw `❌ Link grup tidak valid atau sudah expired!\nError: ${e.message}`
        }
    }
    return null
}

// ─── Helper: nama grup ────────────────────────────────────────────────────────
async function getGroupName(conn, jid) {
    try {
        const meta = await conn.groupMetadata(jid)
        return meta?.subject || jid
    } catch (_) {
        return jid
    }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
let handler = async (m, { conn, args, usedPrefix, command }) => {
    // Parse argumen
    let targetInput = null
    let hariInput   = null

    if (args.length === 0) {
        throw (
            `Format salah!\n\n` +
            `*Cara pakai:*\n` +
            `• ${usedPrefix}perpanjang <link/id> <hari>\n` +
            `• ${usedPrefix}perpanjang <hari> _(jika di dalam grup)_\n\n` +
            `*Contoh:*\n` +
            `• ${usedPrefix}perpanjang https://chat.whatsapp.com/xxx 30\n` +
            `• ${usedPrefix}perpanjang 120363xxx@g.us 7\n` +
            `• ${usedPrefix}perpanjang 14 _(di dalam grup)_`
        )
    }

    // Jika di grup dan args[0] adalah angka murni → target = grup saat ini
    if (m.isGroup && !isNaN(args[0]) && parseInt(args[0]) > 0 &&
        !args[0].includes('@') && !args[0].includes('chat.whatsapp')) {
        targetInput = m.chat
        hariInput   = parseInt(args[0])
    } else {
        targetInput = args[0]
        hariInput   = parseInt(args[1])
    }

    if (!hariInput || isNaN(hariInput) || hariInput <= 0) {
        throw `Masukkan jumlah hari yang valid!\n*Contoh: ${usedPrefix}perpanjang 120363xxx@g.us 30*`
    }

    // Resolve JID
    let who
    try {
        who = await resolveGroupId(conn, targetInput)
    } catch (e) {
        return m.reply(String(e))
    }

    if (!who) return m.reply(
        `❌ Target grup tidak valid!\n` +
        `Gunakan link invite atau JID grup.\n` +
        `*Contoh: ${usedPrefix}perpanjang https://chat.whatsapp.com/xxx 30*`
    )

    const now      = Date.now()
    const jumlahMs = 86400000 * hariInput

    if (!global.db.data.chats)      global.db.data.chats = {}
    if (!global.db.data.chats[who]) global.db.data.chats[who] = {}
    const chat = global.db.data.chats[who]

    const sebelumnya    = chat.expired || 0
    const masihAktif    = sebelumnya > now
    const sisaSebelumMs = masihAktif ? sebelumnya - now : 0

    // Perpanjang dari sisa waktu (kalau masih aktif) atau dari sekarang
    const baseTime   = masihAktif ? sebelumnya : now
    chat.expired     = baseTime + jumlahMs
    await global.db.write()

    const sisaBaru  = chat.expired - now
    const expDate   = new Date(chat.expired).toLocaleString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    })

    const nama = await getGroupName(conn, who)

    // Notif ke grup
    try {
        await conn.sendMessage(who, {
            text:
                `✅ *Sewa Bot Diperpanjang!*\n\n` +
                `➕ *Ditambah:* ${hariInput} hari\n` +
                `⏳ *Total sisa:* ${msToDate(sisaBaru)}\n` +
                `📅 *Expired:* ${expDate}\n\n` +
                `Terima kasih sudah memperpanjang! 🙏`
        })
    } catch (_) {}

    return m.reply(
        `╭─「 🔄 *SEWA DIPERPANJANG* 」\n` +
        `│\n` +
        `│  📋 *Grup:* ${nama}\n` +
        `│  🆔 \`${who}\`\n` +
        `│\n` +
        `│  ⏳ *Sisa sebelum:*\n` +
        `│  ${masihAktif ? msToDate(sisaSebelumMs) : '_Tidak aktif_'}\n` +
        `│\n` +
        `│  ➕ *Ditambah:* ${hariInput} hari\n` +
        `│\n` +
        `│  ⏳ *Total sisa sekarang:*\n` +
        `│  ${msToDate(sisaBaru)}\n` +
        `│\n` +
        `│  📅 *Expired:* ${expDate}\n` +
        `│\n` +
        `╰─────────────────`
    )
}

handler.help    = ['perpanjang <link/id> <hari>']
handler.tags    = ['owner']
handler.command = /^perpanjang$/i
handler.owner   = true

module.exports = handler
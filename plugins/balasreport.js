// plugins/balasreport.js
// Owner reply ke user yang kirim .report atau .request
//
// Cara pakai:
//   1. Bot kirim pesan REPORT/REQUEST ke owner (via report.js)
//   2. Owner *reply (quote)* pesan itu
//   3. Owner ketik: .balasreport <pesan balasan>
//                   .balasrequest <pesan balasan>

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // ── Validasi owner ───────────────────────────────────────────
    if (!m.quoted) throw (
        `❓ *Cara pakai:*\n\n` +
        `1. Buka pesan *REPORT* atau *REQUEST* dari bot\n` +
        `2. *Reply* pesan tersebut\n` +
        `3. Ketik: *${usedPrefix + command} <pesan balasan>*\n\n` +
        `Contoh:\n` +
        `_${usedPrefix + command} Halo, laporan kamu sudah kami terima dan sedang diproses!_`
    )

    if (!text) throw `❌ Tulis pesan balasannya!\nContoh: *${usedPrefix + command} Sudah diperbaiki, coba restart bot kamu.*`

    // ── Ekstrak nomor tujuan dari teks pesan yang di-quote ────────
    // Format dari report.js: "📱 *Nomor*: 628xxxxx"
    const quotedText = m.quoted.text || m.quoted.caption || ''

    const nomorMatch = quotedText.match(/📱\s*\*?Nomor\*?\s*:\s*([0-9]+)/)
    if (!nomorMatch) throw (
        `❌ Gagal membaca nomor pengirim dari pesan yang di-reply!\n\n` +
        `Pastikan kamu me-reply pesan *REPORT* atau *REQUEST* yang dikirim bot, bukan pesan lain.`
    )

    const targetNum = nomorMatch[1]
    const targetJid = targetNum + '@s.whatsapp.net'

    // ── Cek apakah user ada di DB ─────────────────────────────────
    const targetUser = global.db.data.users?.[targetNum]
    const targetName = targetUser?.name || targetNum

    // ── Tentukan tipe (report/request) dari pesan quoted ─────────
    const isRequest  = quotedText.includes('📩 REQUEST')
    const typeLabel  = isRequest ? '📩 REQUEST' : '🚨 REPORT'
    const typeCmd    = isRequest ? 'request' : 'report'

    // ── Ambil isi laporan asli dari quoted ────────────────────────
    const pesanMatch = quotedText.match(/💬\s*\*?Pesan\*?\s*:\n([\s\S]+?)(?:\n\n📎|$)/)
    const pesanAsli  = pesanMatch ? pesanMatch[1].trim() : '_(tidak diketahui)_'

    // ── Info owner pengirim ───────────────────────────────────────
    const ownerNum  = jidToNum(m.sender)
    const ownerData = global.db.data.users?.[ownerNum]
    const ownerName = ownerData?.name || 'Owner'
    const time      = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })

    // ── Kirim balasan ke user ─────────────────────────────────────
    const pesanKeUser =
`╭─「 📬 *BALASAN ${typeLabel}* 」
│
│  👑 *Dari:* Owner (${ownerName})
│  🕐 *Waktu:* ${time}
│
│  ── *${typeLabel} kamu:* ──
│  ${pesanAsli.split('\n').join('\n│  ')}
│
│  ── *Balasan:* ──
│  ${text.split('\n').join('\n│  ')}
│
╰─────────────────`

    try {
        await conn.sendMessage(targetJid, { text: pesanKeUser })
    } catch (e) {
        console.log('[BALASREPORT] Gagal kirim ke user:', e.message)
        throw `❌ Gagal mengirim balasan ke *${targetName}* (${targetNum})!\nPastikan nomor masih aktif.`
    }

    // ── Kirim log ke grup ─────────────────────────────────────────
    const LOG_GROUP = '120363407596132234@g.us'
    const logTeks = [
        `╭─「 📬 *LOG BALASAN ${typeLabel}* 」`,
        `│`,
        `│  👑 *Owner:* ${ownerName}`,
        `│  👤 *User:* ${targetName} (${targetNum})`,
        `│  🕐 *Waktu:* ${time}`,
        `│`,
        `│  ── *${typeCmd} asli:* ──`,
        `│  ${pesanAsli.split('\n').join('\n│  ')}`,
        `│`,
        `│  ── *Balasan owner:* ──`,
        `│  ${text.split('\n').join('\n│  ')}`,
        `│`,
        `╰─────────────────`,
    ].join('\n')

    await conn.sendMessage(LOG_GROUP, {
        text    : logTeks,
        mentions: [targetJid]
    }).catch(e => console.log('[BALASREPORT] Gagal kirim ke grup log:', e.message))

    // ── Konfirmasi ke owner ───────────────────────────────────────
    m.reply(
`╭─「 ✅ *BALASAN TERKIRIM* 」
│
│  📬 *Tipe:* ${typeLabel}
│  👤 *Kepada:* ${targetName} (${targetNum})
│  💬 *Pesan:* ${text.length > 60 ? text.slice(0, 60) + '...' : text}
│
╰─────────────────`.trim()
    )
}

handler.help    = ['balasreport <pesan>', 'balasrequest <pesan>']
handler.tags    = ['owner']
handler.command = /^(balasreport|balasrequest)$/i
handler.owner   = true
handler.exp     = 0

module.exports = handler

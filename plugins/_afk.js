const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
let handler = m => m

handler.before = async (m, { conn }) => {
    if (!m.sender) return true

    // Pastikan user ada di database
    if (!getDbUser(m.sender)) return true
    let user = getDbUser(m.sender)

    // Cek kalau pengirim sedang AFK dan baru aktif lagi
    if (user.afk > -1) {
        m.reply(`✅ Kamu berhenti AFK${user.afkReason ? '\n📝 Alasan: ' + user.afkReason : ''}\n⏱️ Durasi: ${clockString(new Date - user.afk)}`)
        user.afk = -1
        user.afkReason = ''
    }

    // Cek kalau ada yang tag/reply user yang sedang AFK
    const jids = [...new Set([
        ...(m.mentionedJid || []),
        ...(m.quoted ? [m.quoted.sender] : [])
    ])]

    for (let jid of jids) {
        // Skip kalau tag diri sendiri
        if (jid === m.sender) continue

        let u = getDbUser(jid)
        if (!u) continue

        let afkTime = u.afk
        if (!afkTime || afkTime < 0) continue

        let reason = u.afkReason || ''
        let name   = conn.getName(jid) || jid.split('@')[0]

        m.reply(`⚠️ Jangan tag dia!\n👤 *${name}* sedang AFK${reason ? '\n📝 Alasan: ' + reason : ' tanpa alasan'}\n⏱️ Sudah: ${clockString(new Date - afkTime)}`)
    }

    return true
}

module.exports = handler

function clockString(ms) {
    if (isNaN(ms)) return '--:--:--'
    let h = Math.floor(ms / 3600000)
    let m = Math.floor(ms / 60000) % 60
    let s = Math.floor(ms / 1000) % 60
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}
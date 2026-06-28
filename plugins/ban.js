// ban.js - Ban & Unban user dari bot
// Cara pakai: .ban / .unban via tag, reply, atau nomor

let handler = async (m, { conn, args, text, usedPrefix, command }) => {
    const isBan   = /^ban$/i.test(command)
    const isUnban = /^unban$/i.test(command)

    // ── Resolve target JID ────────────────────────────────────────
    let targetJid  = null
    let targetName = null

    // 1. Dari reply
    if (m.quoted) {
        targetJid  = m.quoted.sender || m.quoted.key?.participant || null
        targetName = m.quoted.pushName || null
    }

    // 2. Dari mention/tag
    if (!targetJid && m.mentionedJid && m.mentionedJid.length > 0) {
        targetJid = m.mentionedJid[0]
    }

    // 3. Dari nomor (args[0]) — bisa 628xxx atau 08xxx
    if (!targetJid && args[0]) {
        let num = args[0].replace(/[^0-9]/g, '')
        if (num.startsWith('0')) num = '62' + num.slice(1)
        if (num.length >= 9) targetJid = num + '@s.whatsapp.net'
    }

    if (!targetJid) return m.reply(
        `⚠️ *Format Salah!*\n\n` +
        `Gunakan salah satu cara:\n` +
        `• *${usedPrefix}${command}* @tag <alasan>\n` +
        `• Reply pesan user → *${usedPrefix}${command}* <alasan>\n` +
        `• *${usedPrefix}${command}* 628xxxx <alasan>\n\n` +
        `Contoh:\n` +
        `• ${usedPrefix}ban @user spam\n` +
        `• ${usedPrefix}unban 6281234567890`
    )

    // Normalisasi JID
    if (!targetJid.includes('@')) targetJid += '@s.whatsapp.net'
    const targetNum = targetJid.split('@')[0].split(':')[0]

    // Cegah ban diri sendiri atau owner
    const senderNum   = (m.sender || '').split('@')[0].split(':')[0]
    const ownerNums   = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
    const isTargetOwner = ownerNums.includes(targetNum) || m.fromMe && targetJid === conn.user?.jid

    if (targetNum === senderNum && isBan) return m.reply('❌ Kamu tidak bisa ban diri sendiri!')
    if (isTargetOwner) return m.reply('❌ Tidak bisa ban/unban sesama owner!')

    // Pastikan DB user tersedia
    if (!global.db.data.users) global.db.data.users = {}

    // Ambil alasan — hapus bagian mention/nomor dari teks
    let alasan = (text || '')
        .replace(/@\d+/g, '')       // hapus @628xxx
        .replace(/^628\d+\s*/g, '') // hapus nomor di awal
        .replace(/^\d+\s*/g, '')    // hapus angka murni di awal
        .trim()
    if (!alasan) alasan = isBan ? 'Melanggar aturan' : '-'

    // Ambil nama dari WA atau DB
    if (!targetName) {
        try {
            const contact = conn.contacts?.[targetJid]
            targetName = contact?.name || contact?.notify || global.db.data.users?.[targetNum]?.name || targetNum
        } catch (_) {
            targetName = targetNum
        }
    }

    // ── BAN ───────────────────────────────────────────────────────
    if (isBan) {
        if (!global.db.data.users[targetNum]) {
            global.db.data.users[targetNum] = {}
        }

        const user = global.db.data.users[targetNum]
        if (user.banned) return m.reply(
            `⚠️ User *${targetName}* sudah dalam status *banned*!\n` +
            `Alasan sebelumnya: ${user.banReason || '-'}`
        )

        user.banned    = true
        user.banReason = alasan
        user.banTime   = Date.now()
        user.banBy     = senderNum

        await global.db.write()

        await m.reply(
            `🔨 *BAN BERHASIL!*\n\n` +
            `👤 User   : @${targetNum}\n` +
            `📌 Alasan : ${alasan}\n` +
            `🕐 Waktu  : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA`,
            null, { mentions: [targetJid] }
        )

        // Notif ke user yang di-ban (DM)
        try {
            await conn.sendMessage(targetJid, {
                text:
                    `🚫 *Kamu telah di-BAN dari bot ini!*\n\n` +
                    `📌 *Alasan:* ${alasan}\n` +
                    `🕐 *Waktu :* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })} WITA\n\n` +
                    `Hubungi owner jika merasa ini kesalahan.`
            })
        } catch (_) {}

        return
    }

    // ── UNBAN ─────────────────────────────────────────────────────
    if (isUnban) {
        const user = global.db.data.users?.[targetNum]

        if (!user || !user.banned) return m.reply(
            `⚠️ User *${targetName}* tidak dalam status banned!`
        )

        user.banned    = false
        user.banReason = ''
        user.banTime   = 0
        user.banBy     = ''

        await global.db.write()

        await m.reply(
            `✅ *UNBAN BERHASIL!*\n\n` +
            `👤 User   : @${targetNum}\n` +
            `📌 Catatan: User sudah bebas dan bisa pakai bot kembali.`,
            null, { mentions: [targetJid] }
        )

        // Notif ke user yang di-unban (DM)
        try {
            await conn.sendMessage(targetJid, {
                text:
                    `✅ *Kamu telah di-UNBAN!*\n\n` +
                    `Kamu sudah bisa menggunakan bot kembali.\n` +
                    `Jaga sikap ya! 😊`
            })
        } catch (_) {}

        return
    }
}

handler.command     = /^(ban|unban)$/i
handler.owner       = true
handler.tags        = ['owner']
handler.help        = ['ban <tag/reply/nomor> <alasan>', 'unban <tag/reply/nomor>']
handler.description = 'Ban/Unban user dari bot'

module.exports = handler


// ── Plugin "before" — cek banned sebelum command diproses ────────
// Tambahkan ini di file terpisah: plugins/_banned.js
// ATAU tambahkan langsung ke handler.js di bagian plugin.before
// File ini sudah include keduanya untuk kemudahan

// Ekspor juga checker untuk dipakai di handler lain
module.exports.checkBanned = async function (m, conn) {
    if (!m.sender) return false
    const num  = m.sender.split('@')[0].split(':')[0]
    const user = global.db.data?.users?.[num]
    if (!user?.banned) return false

    const alasan = user.banReason || 'Tidak ada alasan'
    await conn.sendMessage(m.chat, {
        text:
            `🚫 *Kamu telah di-BAN oleh Owner!*\n\n` +
            `📌 *Alasan:* ${alasan}\n\n` +
            `Hubungi owner jika merasa ini kesalahan.`
    }, { quoted: m })

    return true
}
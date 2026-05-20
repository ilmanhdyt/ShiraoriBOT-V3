const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/enable.js - Toggle fitur bot (persistent ke database)
// FIXED: case 'bot'/'aktif' sekarang await db.write() sebelum return

let handler = async (m, { conn, usedPrefix, command, args, isOwner, isAdmin, isROwner }) => {
    const isEnable = /true|enable|(turn)?on|1/i.test(command)
    const type     = (args[0] || '').toLowerCase()

    // Safe accessor — pastikan chats/users/settings ada
    if (!global.db.data.chats)    global.db.data.chats    = {}
    if (!global.db.data.users)    global.db.data.users    = {}
    if (!global.db.data.settings) global.db.data.settings = {}

    if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}

    const chat    = global.db.data.chats[m.chat]
    const user    = getDbUser(m.sender)
    const setting = global.db.data.settings

    let isAll  = false
    let isUser = false

    switch (type) {
        // ── Group/Chat ──────────────────────────────────
        case 'w':
        case 'welcome':
            if (!m.isGroup) {
                if (!isOwner) return global.dfail('group', m, conn)
            } else if (!(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.welcome = isEnable
            global.db.data.chats[m.chat] = chat
            break

        case 'simi':
            if (m.isGroup && !(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.simi = isEnable
            global.db.data.chats[m.chat] = chat
            break

        case 'delete':
        case 'antidelete':
            if (!m.isGroup) {
                if (!isOwner) return global.dfail('group', m, conn)
            } else if (!(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.delete = isEnable
            global.db.data.chats[m.chat] = chat
            break

        case 'antitoxic':
            if (!m.isGroup) {
                if (!isOwner) return global.dfail('group', m, conn)
            } else if (!(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.antiToxic = isEnable
            global.db.data.chats[m.chat] = chat
            break

        case 'antilink':
        case 'antiurl':
            if (!m.isGroup) {
                if (!isOwner) return global.dfail('group', m, conn)
            } else if (!(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.antiLink = isEnable
            global.db.data.chats[m.chat] = chat
            break

        case 'antispam':
            if (!m.isGroup) {
                if (!isOwner) return global.dfail('group', m, conn)
            } else if (!(isAdmin || isOwner)) return global.dfail('admin', m, conn)
            chat.antispam = isEnable
            global.db.data.chats[m.chat] = chat
            break

        // ── User ────────────────────────────────────────
        case 'autolevelup':
        case 'levelup':
            if (!user) return m.reply('❌ Kamu belum terdaftar! Ketik *.daftar* dulu.')
            isUser = true
            user.autolevelup = isEnable
            break

        // ── Owner ───────────────────────────────────────
        case 'mycontact':
        case 'mycontacts':
        case 'whitelistcontact':
        case 'whitelistcontacts':
        case 'whitelistmycontact':
        case 'whitelistmycontacts':
            if (!isOwner) return global.dfail('owner', m, conn)
            conn.callWhitelistMode = isEnable
            break

        case 'bot':
        case 'aktif':
            if (!m.isGroup) return m.reply('❌ Command ini hanya untuk grup!')
            if (!isOwner && !isAdmin) return global.dfail('admin', m, conn)
            chat.botActive = isEnable
            global.db.data.chats[m.chat] = chat
            // FIXED: db.write() wajib dipanggil di sini
            // Sebelumnya case ini langsung return → skip db.write() di bawah
            // Akibatnya botActive tidak tersimpan → hilang saat restart
            await global.db.write()
            return m.reply(`✅ Bot di grup ini berhasil di *${isEnable ? 'aktifkan' : 'nonaktifkan'}*`)

        case 'grup':
        case 'gruponly':
        case 'grouponly':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.groupOnly   = isEnable
            global.opts['self'] = !isEnable
            break

        case 'backup':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.backup        = isEnable
            global.opts['backup'] = isEnable
            break

        case 'anticall':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.anticall        = isEnable
            global.opts['anticall'] = isEnable
            break

        case 'antitroli':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.antitroli        = isEnable
            global.opts['antitroli'] = isEnable
            break

        case 'autoread':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.autoread        = isEnable
            global.opts['autoread'] = isEnable
            break

        case 'restrict':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.restrict        = isEnable
            global.opts['restrict'] = isEnable
            break

        case 'nsfw':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.nsfw        = isEnable
            global.opts['nsfw'] = isEnable
            break

        case 'jadibot':
            isAll = true
            if (!isOwner) return global.dfail('owner', m, conn)
            setting.jadibot        = isEnable
            global.opts['jadibot'] = isEnable
            break

        // ── ROwner ──────────────────────────────────────
        case 'publik':
        case 'public':
            isAll = true
            if (!isROwner) return global.dfail('rowner', m, conn)
            setting.public      = isEnable
            global.opts['self'] = !isEnable
            break

        // ── Default ─────────────────────────────────────
        default:
            if (!/[01]/.test(command)) throw `
╭─「 Daftar Opsi 」
│${isOwner ? '\n├ 🌐 public / grouponly\n├ 🚫 anticall / antispam\n├ 🚫 antitroli / antilink\n├ 🔧 autoread / restrict\n├ 🔧 backup / jadibot / nsfw\n├ 🔇 simi / autolevelup' : ''}
├ 💬 welcome / delete
├ 💬 antispam / antilink
├ 💬 simi / antitoxic
│
├ Contoh:
├ ${usedPrefix}on welcome
└ ${usedPrefix}off antispam
`.trim()
            throw false
    }

    // FIXED: simpan settings + write untuk semua case selain 'bot'/'aktif'
    global.db.data.settings = setting
    await global.db.write()

    m.reply(`✅ *${type}* berhasil di *${isEnable ? 'aktifkan' : 'matikan'}* ${isAll ? 'untuk bot ini' : isUser ? 'untuk kamu' : 'untuk chat ini'}`)
}

handler.help    = ['on', 'off'].map(v => v + ' <opsi>')
handler.tags    = ['group', 'owner']
handler.command = /^((en|dis)able|(tru|fals)e|(turn)?o(n|ff)|[01])$/i

module.exports = handler
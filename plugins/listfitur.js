// plugins/listuser.js
// ═══════════════════════════════════════════════════════════════════
//  LIST USER — Daftar semua user yang sudah register
//
//  Command:
//    .listuser          → daftar semua user terdaftar
//    .listuser premium  → daftar user premium saja
//    .listuser banned   → daftar user yang dibanned
//    .listuser top      → top 10 user berdasar level/exp
//    .cekuser @tag      → lihat detail profil 1 user
//    .totaluser         → ringkasan statistik semua user
// ═══════════════════════════════════════════════════════════════════

const { createHash } = require('crypto')

// ── Helper format waktu ───────────────────────────────────────────────────────
function formatDate(ts) {
    if (!ts || ts <= 0) return 'Tidak diketahui'
    return new Date(ts).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
    })
}

function timeAgo(ts) {
    if (!ts || ts <= 0) return '-'
    const diff = Date.now() - ts
    const d = Math.floor(diff / 86400000)
    const h = Math.floor((diff % 86400000) / 3600000)
    if (d > 0) return `${d} hari lalu`
    if (h > 0) return `${h} jam lalu`
    return 'Baru saja'
}

// ── Helper ambil semua user terdaftar ────────────────────────────────────────
function getRegisteredUsers() {
    const users = global.db.data.users || {}
    return Object.entries(users)
        .filter(([, u]) => u.registered === true)
        .map(([jid, u]) => ({
            jid,
            number : jid.split('@')[0].split(':')[0],
            name   : u.name   || 'Tanpa Nama',
            age    : u.age    || 0,
            level  : u.level  || 0,
            role   : u.role   || 'Beginner',
            exp    : u.exp    || 0,
            money  : u.money  || 0,
            banned : u.banned || false,
            regTime: u.regTime || 0,
        }))
}

// ── Helper cek premium ────────────────────────────────────────────────────────
function isPremium(number) {
    const premList = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
    return premList.includes(number.replace(/[^0-9]/g, ''))
}

// ── Handler utama ─────────────────────────────────────────────────────────────
let handler = async (m, { conn, command, args, usedPrefix, isOwner }) => {
    const cmd    = command.toLowerCase()
    const filter = (args[0] || '').toLowerCase()

    // ── .totaluser → statistik ringkas ───────────────────────────────────────
    if (/^totaluser$/.test(cmd)) {
        const allUsers    = Object.values(global.db.data.users || {})
        const total       = allUsers.length
        const registered  = allUsers.filter(u => u.registered).length
        const unregistered= total - registered
        const banned      = allUsers.filter(u => u.banned).length
        const premCount   = (global.prems || []).length
        const avgLevel    = registered > 0
            ? (allUsers.filter(u => u.registered).reduce((s, u) => s + (u.level || 0), 0) / registered).toFixed(1)
            : 0

        return m.reply(
            `╭─「 📊 *Statistik User* 」\n│\n` +
            `│  👥 *Total User:* ${total}\n` +
            `│  ✅ *Terdaftar:* ${registered}\n` +
            `│  ❌ *Belum Daftar:* ${unregistered}\n` +
            `│  ⭐ *Premium:* ${premCount}\n` +
            `│  🚫 *Banned:* ${banned}\n` +
            `│  📈 *Rata-rata Level:* ${avgLevel}\n│\n` +
            `╰─ Ketik *${usedPrefix}listuser* untuk detail`
        )
    }

    // ── .cekuser → detail 1 user ──────────────────────────────────────────────
    if (/^cekuser$/.test(cmd)) {
        if (!isOwner) return m.reply('❌ Hanya owner yang bisa menggunakan perintah ini!')

        // Ambil dari mention atau argumen nomor
        const mentioned = m.mentionedJid?.[0]
        const targetNum = mentioned || (args[0] ? args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net' : null)

        if (!targetNum) return m.reply(
            `❌ Tag atau sebut nomor user!\n\nContoh:\n` +
            `• *${usedPrefix}cekuser @user*\n` +
            `• *${usedPrefix}cekuser 628xxx*`
        )

        const jid  = targetNum.includes('@') ? targetNum : targetNum + '@s.whatsapp.net'
        const user = global.db.data.users?.[jid] || global.db.data.users?.[jid.replace('@s.whatsapp.net', ':0@s.whatsapp.net')]

        if (!user) return m.reply(`❌ User tidak ditemukan di database.`)

        const number = jid.split('@')[0].split(':')[0]
        const sn     = createHash('md5').update(jid).digest('hex').toUpperCase().slice(0, 16)
        const prem   = isPremium(number)

        return m.reply(
            `╭─「 👤 *Detail User* 」\n│\n` +
            `│  📱 *Nomor:* ${number}\n` +
            `│  👤 *Nama:* ${user.name || '-'}\n` +
            `│  🎂 *Umur:* ${user.age || '-'} Tahun\n` +
            `│  ✅ *Status:* ${user.registered ? 'Terdaftar' : 'Belum Daftar'}\n` +
            `│  🎖️ *Role:* ${user.role || 'Beginner'}\n` +
            `│  📊 *Level:* ${user.level || 0}\n` +
            `│  ✉️ *EXP:* ${(user.exp || 0).toLocaleString('id-ID')}\n` +
            `│  💵 *Uang:* ${(user.money || 0).toLocaleString('id-ID')}\n` +
            `│  ⭐ *Premium:* ${prem ? 'Ya' : 'Tidak'}\n` +
            `│  🚫 *Banned:* ${user.banned ? 'Ya' : 'Tidak'}\n` +
            `│  📅 *Daftar:* ${formatDate(user.regTime)}\n` +
            `│  🔑 *SN:* ${sn}\n│\n` +
            `╰────────────────────`
        )
    }

    // ── .listuser → daftar user ───────────────────────────────────────────────
    if (!isOwner) return m.reply('❌ Hanya owner yang bisa melihat daftar user!')

    let users = getRegisteredUsers()

    // Filter berdasar argumen
    if (filter === 'premium') {
        users = users.filter(u => isPremium(u.number))
    } else if (filter === 'banned') {
        users = users.filter(u => u.banned)
    } else if (filter === 'top') {
        users = users.sort((a, b) => b.level - a.level || b.exp - a.exp).slice(0, 10)
    } else {
        // Default: urutkan dari terbaru daftar
        users = users.sort((a, b) => b.regTime - a.regTime)
    }

    if (!users.length) {
        const pesanKosong = {
            premium: 'Belum ada user premium.',
            banned : 'Tidak ada user yang dibanned.',
            top    : 'Belum ada user terdaftar.',
        }
        return m.reply(`📭 ${pesanKosong[filter] || 'Belum ada user yang terdaftar.'}`)
    }

    // Buat daftar — batasi 30 per halaman agar tidak terlalu panjang
    const page     = parseInt(args[filter ? 1 : 0]) || 1
    const perPage  = 20
    const total    = users.length
    const totalPage= Math.ceil(total / perPage)
    const start    = (page - 1) * perPage
    const paged    = users.slice(start, start + perPage)

    const judul = {
        premium: '⭐ Daftar User Premium',
        banned : '🚫 Daftar User Banned',
        top    : '🏆 Top 10 User',
    }[filter] || '📋 Daftar User Terdaftar'

    const rows = paged.map((u, i) => {
        const no     = start + i + 1
        const prem   = isPremium(u.number) ? '⭐' : ''
        const ban    = u.banned ? '🚫' : ''
        const status = prem || ban || '👤'
        return (
            `│  ${no}. ${status} *${u.name}* (${u.age}th)\n` +
            `│      📱 ${u.number}\n` +
            `│      Lv.${u.level} • ${u.role} • ${timeAgo(u.regTime)}`
        )
    }).join('\n│\n')

    return m.reply(
        `╭─「 ${judul} 」\n│\n` +
        rows + '\n│\n' +
        `├─ Total: *${total} user*\n` +
        (totalPage > 1
            ? `├─ Halaman ${page}/${totalPage}\n` +
              `├─ Next: *${usedPrefix}listuser ${filter || ''} ${page + 1}*\n`
            : '') +
        `╰─ *${usedPrefix}totaluser* untuk statistik\n` +
        `   *${usedPrefix}cekuser @tag* untuk detail user`
    )
}

handler.help    = [
    'listuser - daftar semua user terdaftar',
    'listuser premium - daftar user premium',
    'listuser banned - daftar user banned',
    'listuser top - top 10 user tertinggi',
    'cekuser @tag - detail profil user',
    'totaluser - statistik ringkas',
]
handler.tags    = ['owner']
handler.command = /^(listuser|listusr|daftaruser|cekuser|totaluser)$/i
handler.owner   = true

module.exports = handler
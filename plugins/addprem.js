let fs = require('fs')

const PREM_PATH = './src/premium.json'

function readPrem() {
    try {
        const raw = fs.readFileSync(PREM_PATH, 'utf8').trim()
        if (!raw) return []
        return JSON.parse(raw)
    } catch (_) {
        return []
    }
}

function savePrem(arr) {
    fs.writeFileSync(PREM_PATH, JSON.stringify(arr, null, 2))
}

let handler = async (m, { conn, text }) => {
    const json = readPrem()

    let who

    if (text && /\d/.test(text)) {
        who = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
    } else if (m.isGroup) {
        who = m.mentionedJid[0]
            ? m.mentionedJid[0]
            : m.quoted
                ? m.quoted.sender
                : null
    } else {
        who = null
    }

    if (!who) return m.reply('❌ Sebutkan siapa yang mau dijadikan premium!\n\nContoh:\n• `.addprem @tag` (di group)\n• `.addprem 6281xxx` (di private/group)\n• Reply pesan + `.addprem` (di group)')

    const decoded = conn.decodeJid(who)
    const num     = decoded.split('@')[0].split(':')[0]

    if (!/^\d{8,15}$/.test(num)) return m.reply(`❌ Nomor tidak valid: ${num}\n\nPastikan format:\n• 62813526837\n• 628135268371234`)

    if (json.includes(num)) {
        return m.reply(`⚠️ ${conn.getName(who) || num} sudah premium!`)
    }

    json.push(num)
    savePrem(json)

    if (!global.prems) global.prems = []
    if (!global.prems.includes(num)) global.prems.push(num)

    if (!global.db.data.users) global.db.data.users = {}

    // Update database — loop semua key yang nomornya cocok
    for (const key of Object.keys(global.db.data.users)) {
        const keyNum = key.split('@')[0].split(':')[0]
        if (keyNum === num) {
            const u = global.db.data.users[key]
            if (u) {
                u.premium = true
                u.limit   = 100
            }
        }
    }

    // Kalau belum ada di database sama sekali, buat entry baru
    const dbKey = jidToNum(num + '@s.whatsapp.net')
    if (!global.db.data.users[dbKey]) {
        global.db.data.users[dbKey] = {
            premium: true,
            exp: 0,
            limit: 100,
            lastclaim: 0,
            registered: false
        }
    } else {
        global.db.data.users[dbKey].premium = true
        global.db.data.users[dbKey].limit   = 100
    }

    await global.db.write()

    m.reply(`✅ *Berhasil menambahkan premium!*\n\n👤 User: ${conn.getName(who) || num}\n📱 Nomor: ${num}\n💎 Status: Premium Active`)
}

handler.help    = ['addprem [@user/nomor]']
handler.tags    = ['owner']
handler.command = /^(add|tambah|\+)prem(ium)?$/i
handler.owner   = true

module.exports = handler

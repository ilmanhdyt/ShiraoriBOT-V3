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

    if (!who) return m.reply('❌ Sebutkan siapa yang mau dihapus premiumnya!\n\nContoh:\n• `.delprem @tag` (di group)\n• `.delprem 6281xxx` (di private/group)\n• Reply pesan + `.delprem` (di group)')

    const decoded = conn.decodeJid(who)
    const num     = decoded.split('@')[0].split(':')[0]

    if (!/^\d{8,15}$/.test(num)) return m.reply(`❌ Nomor tidak valid: ${num}`)

    if (!json.includes(num)) {
        return m.reply(`⚠️ ${conn.getName(who) || num} tidak ada dalam daftar premium!`)
    }

    const index = json.indexOf(num)
    json.splice(index, 1)
    savePrem(json)

    if (global.prems && global.prems.includes(num)) {
        const idx = global.prems.indexOf(num)
        global.prems.splice(idx, 1)
    }

    if (!global.db.data.users) global.db.data.users = {}

    // Update database — loop semua key yang nomornya cocok
    for (const key of Object.keys(global.db.data.users)) {
        const keyNum = key.split('@')[0].split(':')[0]
        if (keyNum === num) {
            const u = global.db.data.users[key]
            if (u) {
                u.premium = false
                u.limit   = 10
            }
        }
    }

    await global.db.write()

    m.reply(`✅ *Berhasil menghapus premium!*\n\n👤 User: ${conn.getName(who) || num}\n📱 Nomor: ${num}\n💎 Status: Premium Removed`)
}

handler.help    = ['delprem [@user/nomor]']
handler.tags    = ['owner']
handler.command = /^(del|hapus|-)prem(ium)?$/i
handler.owner   = true

module.exports = handler

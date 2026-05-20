const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
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

let handler = async (m, { conn }) => {
    const json = readPrem()

    if (!json || json.length === 0) {
        return m.reply('📋 *Daftar Premium User*\n\n❌ Belum ada user premium.')
    }

    let text = '📋 *Daftar Premium User*\n\n'
    text += `Total: ${json.length} user${json.length > 1 ? 's' : ''}\n\n`

    for (let i = 0; i < json.length; i++) {
        const num = json[i]
        const jid = num + '@s.whatsapp.net'
        const name = conn.getName(jid) || num
        
        // Check if user exists in database
        const userDb = getDbUser(jid)
        const isPremInDb = userDb && userDb.premium
        
        text += `${i + 1}. ${name}\n`
        text += `   📱 ${num}\n`
        text += `   💎 Status: ${isPremInDb ? '✅ Active' : '⚠️ Not in DB'}\n`
        if (userDb) {
            text += `   🎯 Limit: ${userDb.limit || 0}\n`
            text += `   ⭐ Level: ${userDb.level || 0}\n`
        }
        text += '\n'
    }

    text += '━━━━━━━━━━━━━━━\n'
    text += 'Gunakan:\n'
    text += '• `.addprem 628xxx` untuk add\n'
    text += '• `.delprem 628xxx` untuk hapus'

    m.reply(text)
}

handler.help    = ['listprem', 'premlist']
handler.tags    = ['owner']
handler.command = /^(list)?prem(ium)?(list)?$/i
handler.owner   = false

module.exports = handler
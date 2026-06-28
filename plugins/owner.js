// plugins/owner.js — Kirim vCard kontak owner

const PhoneNumber = require('awesome-phonenumber')

/** Safe international format — fallback ke +nomor jika PhoneNumber gagal */
function safeIntl(num) {
    try {
        return PhoneNumber('+' + num).getNumber('international') || ('+' + num)
    } catch (_) {
        return '+' + num
    }
}

async function handler(m) {
    const name   = 'Ilman'
    const number = (global.owner[0] || '').replace(/[^0-9]/g, '')

    if (!number) return m.reply('❌ Nomor owner belum diset di config.js')

    const vcard = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${name};;;`,
        `FN:${name}`,
        `TEL;type=CELL;type=VOICE;waid=${number}:${safeIntl(number)}`,
        'END:VCARD'
    ].join('\n')

    await this.sendMessage(m.chat, {
        contacts: {
            displayName: name,
            contacts   : [{ vcard }]
        }
    }, { quoted: m })
}

handler.help    = ['owner', 'creator']
handler.tags    = ['info']
handler.command = /^(owner|creator)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.exp      = 3

module.exports = handler

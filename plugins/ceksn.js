const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
const { createHash } = require('crypto')

let handler = async function (m, { usedPrefix }) {
    const user = getDbUser(m.sender)
    if (!user) return m.reply('❌ Data kamu tidak ditemukan!')
    if (!user.registered) {
        return m.reply(
            `❌ Kamu belum terdaftar!\n\n` +
            `Ketik *${usedPrefix}daftar nama.umur* untuk mendaftar.`
        )
    }

    const sn = createHash('md5').update(m.sender).digest('hex').toUpperCase()

    return m.reply(
        `╭─「 🔑 *Serial Number* 」\n│\n` +
        `│  👤 *Nama:* ${user.name}\n` +
        `│  🎂 *Umur:* ${user.age} Tahun\n│\n` +
        `│  🔑 *SN Kamu:*\n` +
        `│  \`${sn}\`\n│\n` +
        `│  ⚠️ Jangan bagikan SN ke siapapun!\n` +
        `│  Gunakan: *${usedPrefix}unreg <SN>*\n│\n` +
        `╰─────────────────`
    )
}

handler.help = ['ceksn']
handler.tags = ['main']
handler.command = /^(ceksn|mysn|liatsn|sn)$/i
handler.register = true

module.exports = handler

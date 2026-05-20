const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
const { createHash } = require('crypto')

let handler = async function (m, { args, usedPrefix }) {
    if (!args[0]) throw `❌ Masukkan Serial Number!\nContoh: *${usedPrefix}unreg <SN>*\n\nSN didapat saat pertama kali daftar.`

    const user = getDbUser(m.sender)
    if (!user) throw '❌ Data kamu tidak ditemukan!'
    if (!user.registered) throw '❌ Kamu belum terdaftar!'

    const sn = createHash('md5').update(m.sender).digest('hex')

    if (args[0].toLowerCase() !== sn.toLowerCase()) {
        throw `❌ Serial Number salah!\n\nPastikan SN yang kamu masukkan benar.\nSN didapat saat pertama kali *${usedPrefix}daftar*`
    }

    const namaLama = user.name
    user.registered = false
    user.name = ''
    user.age = -1
    user.regTime = -1

    await global.db.write()

    m.reply(`✅ *Unreg berhasil!*\n\n👤 *${namaLama}* telah keluar dari sistem.\nDaftar lagi kapan saja dengan *${usedPrefix}daftar nama.umur*`)
}

handler.help = ['', 'ister'].map(v => 'unreg' + v + ' <SN>')
handler.tags = ['xp']
handler.command = /^unreg(ister)?$/i
handler.register = true

module.exports = handler

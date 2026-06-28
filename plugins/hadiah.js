const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// hadiah.js - Klaim hadiah registrasi (hanya di chat pribadi)
// Baileys: atexovi-baileys

let handler = async function (m, { usedPrefix }) {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar!'
    if (!user.registered) throw '❌ Kamu belum terdaftar! Ketik *!daftar nama.umur* dulu.'

    // Cek apakah sudah pernah klaim hadiah
    if (user.hadiahClaimed) throw `❌ Kamu sudah pernah klaim hadiah sebelumnya!\nHadiah hanya bisa diklaim *1 kali* per akun.`

    // Cek premium
    const senderNum = m.sender.split('@')[0].split(':')[0]
    const premNums  = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
    const isPremium = user.premium === true || premNums.includes(senderNum)

    if (!isPremium) throw `❌ Hadiah hanya untuk user *Premium*!\nHubungi owner untuk mendapatkan status premium.`

    // Kasih hadiah
    const hadiahKoin = 10000
    user.money        = (user.money || 0) + hadiahKoin
    user.hadiahClaimed = true

    await global.db.write()

    m.reply(`
╭─「 🎁 *HADIAH REGISTRASI* 」
│
│  👤 *${user.name}*
│  💎 Status: ✨ Premium
│
│  💵 *+${hadiahKoin.toLocaleString('id-ID')} koin* telah ditambahkan!
│  💰 Total koin: ${user.money.toLocaleString('id-ID')}
│
│  Selamat bergabung! Gunakan koinmu untuk
│  membeli pet, upgrade karakter, dan lainnya.
│  Ketik *!menu* untuk melihat semua fitur.
│
╰─────────────────
`.trim())
}

handler.help    = ['hadiah']
handler.tags    = ['xp']
handler.command = /^hadiah$/i
handler.private = true   // hanya di chat pribadi
handler.group   = false
handler.owner   = false
handler.prems = true
handler.register = true
handler.exp     = 0

module.exports = handler
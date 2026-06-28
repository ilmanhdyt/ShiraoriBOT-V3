const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
let handler = async function (m, { usedPrefix }) {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar! Ketik *#daftar nama.umur* dulu.'

    const now       = Date.now()
    const oneDay    = 24 * 60 * 60 * 1000
    const lastClaim = user.lastclaim || 0
    const sisaMs    = (lastClaim + oneDay) - now

    if (sisaMs > 0) {
        const jam  = Math.floor(sisaMs / (60 * 60 * 1000))
        const mnt  = Math.floor((sisaMs % (60 * 60 * 1000)) / (60 * 1000))
        throw `⏳ Kamu sudah klaim hari ini!\nCoba lagi dalam *${jam} jam ${mnt} menit*`
    }

    // Hitung streak
    const kemarin = lastClaim + oneDay
    const gapHari = now - lastClaim
    if (gapHari <= oneDay * 2) {
        // Masih dalam jangka 2 hari = streak lanjut
        user.streak = (user.streak || 0) + 1
    } else {
        // Lewat 2 hari = streak reset
        user.streak = 1
    }

    // Koin base + bonus streak (maks streak 30 hari)
    const streak    = Math.min(user.streak, 30)
    const baseKoin  = 500000
    const bonusKoin = streak * 1000
    const totalKoin = baseKoin + bonusKoin

    // Bonus item tiap 7 hari streak
    let bonusItem = null
    if (streak % 7 === 0) {
        bonusItem = { item: 'petFood', jumlah: 3 }
        user.petFood = (user.petFood || 0) + bonusItem.jumlah
    }

    user.money     = (user.money || 0) + totalKoin
    user.lastclaim = now

    await global.db.write()

    const streakBar = '🔥'.repeat(Math.min(streak, 10)) + (streak > 10 ? ` x${streak}` : '')

    m.reply(`
╭─「 📅 *DAILY CLAIM* 」
│
│  👤 *${user.name || 'User'}*
│  💵 *Koin:* +${totalKoin.toLocaleString('id-ID')}
│     ├ Base: ${baseKoin.toLocaleString('id-ID')}
│     └ Bonus Streak: +${bonusKoin.toLocaleString('id-ID')}
│
│  🔥 *Streak:* ${streakBar}
│  📆 *Hari ke-${streak}* berturut-turut
│${bonusItem ? `\n│  🎁 *Bonus 7 Hari:* +${bonusItem.jumlah} 🍖 Pet Food!\n│` : ''}
│  💰 *Total Koin:* ${(user.money || 0).toLocaleString('id-ID')}
│
│  ⏰ Claim lagi besok!
╰─────────────────
`.trim())
}

handler.help    = ['daily']
handler.tags    = ['rpg', 'game']
handler.command = /^(daily|bonus|claim)$/i
handler.owner   = false
handler.mods    = false
handler.premium = false
handler.group   = false
handler.private = false
handler.admin   = false
handler.botAdmin = false
handler.exp     = 5
handler.register = true

module.exports = handler
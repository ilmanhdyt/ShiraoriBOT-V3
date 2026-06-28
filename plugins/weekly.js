const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/weekly.js

let handler = async (m, { conn }) => {
    let user    = getDbUser(m.sender)
    let _timers = (604800000 - (new Date - user.lastweekly))
    let timers  = clockString(_timers)

    if (new Date - user.lastweekly > 604800000) {
        user.money     = (user.money     || 0) + 200000
        user.legendary = (user.legendary || 0) + 3
        user.lastweekly = new Date * 1

        await conn.reply(m.chat,
            `✅ *WEEKLY CLAIM BERHASIL!*\n\n` +
            `💵 +200.000 rupiah\n` +
            `🎁 +3 Legendary Crate\n\n` +
            `💰 Total Money    : ${Number(user.money).toLocaleString('id-ID')}\n` +
            `🎁 Total Legendary: ${user.legendary}\n\n` +
            `_Klaim lagi minggu depan!_`, m)

    } else {
        const claim   = new Date - user.lastclaim   > 86400000
        const monthly = new Date - user.lastmonthly > 2592000000

        let bonusInfo = ''
        if (claim)   bonusInfo += `\n💡 *Daily* tersedia! Ketik *.collect*`
        if (monthly) bonusInfo += `\n💡 *Monthly* tersedia! Ketik *.monthly*`

        await conn.reply(m.chat,
            `⏳ *BELUM BISA CLAIM*\n\n` +
            `Silahkan tunggu *🕒 ${timers}* lagi.\n` +
            `${bonusInfo}\n\n` +
            `💰 Money kamu   : ${Number(user.money || 0).toLocaleString('id-ID')}\n` +
            `🎁 Legendary    : ${user.legendary || 0}`, m)
    }
}

handler.help     = ['weekly']
handler.tags     = ['rpg']
handler.command  = /^(weekly)$/i
handler.fail     = null
handler.group    = false
handler.register = true

module.exports = handler

function clockString(ms) {
    let h = Math.floor(ms / 3600000)
    let m = Math.floor(ms / 60000) % 60
    let s = Math.floor(ms / 1000) % 60
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}
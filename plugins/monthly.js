const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/monthly.js

let handler = async (m, { conn }) => {
    let user   = getDbUser(m.sender)
    let _timers = (2592000000 - (new Date - user.lastmonthly))
    let timers  = clockString(_timers)

    if (new Date - user.lastmonthly > 2592000000) {
        user.money      = (user.money      || 0) + 100000
        user.legendary  = (user.legendary  || 0) + 5
        user.pet        = (user.pet        || 0) + 3
        user.lastmonthly = new Date * 1

        await conn.reply(m.chat,
            `✅ *MONTHLY CLAIM BERHASIL!*\n\n` +
            `💵 +100.000 Money\n` +
            `🎁 +5 Legendary Crate\n` +
            `📦 +3 Pet Crate\n\n` +
            `💰 Total Money    : ${Number(user.money).toLocaleString('id-ID')}\n` +
            `🎁 Total Legendary: ${user.legendary}\n` +
            `📦 Total Pet Crate: ${user.pet}\n\n` +
            `_Klaim lagi bulan depan!_`, m)

    } else {
        const claim  = new Date - user.lastclaim  > 86400000
        const weekly = new Date - user.lastweekly > 604800000

        let bonusInfo = ''
        if (claim)  bonusInfo += `\n💡 *Daily* tersedia! Ketik *.collect*`
        if (weekly) bonusInfo += `\n💡 *Weekly* tersedia! Ketik *.weekly*`

        await conn.reply(m.chat,
            `⏳ *BELUM BISA CLAIM*\n\n` +
            `Silahkan tunggu *🕒 ${timers}* lagi.\n` +
            `${bonusInfo}\n\n` +
            `💰 Money kamu   : ${Number(user.money || 0).toLocaleString('id-ID')}\n` +
            `🎁 Legendary    : ${user.legendary || 0}\n` +
            `📦 Pet Crate    : ${user.pet || 0}`, m)
    }
}

handler.help     = ['monthly']
handler.tags     = ['rpg']
handler.command  = /^(monthly)$/i
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
// plugins/collect.js

let handler = async (m, { conn }) => {
    const key  = jidToNum(m.sender)
    if (!global.db.data.users) global.db.data.users = {}
    const user = global.db.data.users?.[key]

    if (!user) return m.reply('❌ Kamu belum terdaftar! Ketik *.daftar* dulu.')

    const __timers = (new Date - user.lastclaim)
    const _timers  = (86400000 - __timers)
    const timers   = clockString(_timers)

    if (new Date - user.lastclaim > 86400000) {
        user.money     = (user.money    || 0) + 1000
        user.potion    = (user.potion   || 0) + 1
        user.lastclaim = new Date * 1

        await conn.reply(m.chat,
            `✅ *CLAIM BERHASIL!*\n\n` +
            `💵 +1.000 Money\n` +
            `🧪 +1 Potion\n\n` +
            `💰 Total Money : ${Number(user.money).toLocaleString('id-ID')}\n` +
            `🧪 Total Potion: ${user.potion}\n\n` +
            `_Klaim lagi besok ya!_`, m)

    } else {
        const monthly = new Date - (user.lastmonthly || 0) > 2592000000
        const weekly  = new Date - (user.lastweekly  || 0) > 604800000

        let bonusInfo = ''
        if (monthly) bonusInfo += `\n💡 *Monthly* tersedia! Ketik *.monthly*`
        if (weekly)  bonusInfo += `\n💡 *Weekly* tersedia! Ketik *.weekly*`

        await conn.reply(m.chat,
            `⏳ *BELUM BISA CLAIM*\n\n` +
            `Silahkan tunggu *🕒 ${timers}* lagi untuk bisa claim.\n` +
            `${bonusInfo}\n\n` +
            `💰 Money kamu : ${Number(user.money || 0).toLocaleString('id-ID')}\n` +
            `🧪 Potion     : ${user.potion || 0}`, m)
    }
}

handler.help     = ['collect']
handler.tags     = ['rpg']
handler.command  = /^(collect)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.fail     = null
handler.money    = 0

module.exports = handler

function clockString(ms) {
    let h = Math.floor(ms / 3600000)
    let m = Math.floor(ms / 60000) % 60
    let s = Math.floor(ms / 1000) % 60
    return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
}

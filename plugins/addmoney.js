// addmoney.js - Tambah/kurangi koin owner (khusus owner)

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const jumlah = parseInt(args[0])
    if (!jumlah || isNaN(jumlah)) throw `❌ Masukkan jumlah koin!\nContoh: *${usedPrefix + command} 5000*`

    // Target langsung si pengirim (owner)
    const targetJid = conn.decodeJid(m.sender)
    const dbKey     = jidToNum(targetJid)

    // Pastikan db.users ada
    if (!global.db.data.users) global.db.data.users = {}

    // Pastikan user ada di database
    if (!global.db.data.users[dbKey]) {
        global.db.data.users[dbKey] = { money: 0 }
    }

    const target    = global.db.data.users[dbKey]
    const sebelum   = target.money || 0
    target.money    = Math.max(0, sebelum + jumlah)
    const sesudah   = target.money

    await global.db.write()

    const nama      = target.name || dbKey
    const isAdd     = jumlah > 0
    const absJumlah = Math.abs(jumlah).toLocaleString('id-ID')

    m.reply(`
╭─「 💵 *${isAdd ? 'ADD' : 'REDUCE'} MONEY* 」
│
│  👤 *Target:* ${nama}
│  ${isAdd ? '➕' : '➖'} *Jumlah:* ${isAdd ? '+' : '-'}${absJumlah} koin
│  📊 *Sebelum:* ${sebelum.toLocaleString('id-ID')} koin
│  💰 *Sesudah:* ${sesudah.toLocaleString('id-ID')} koin
│
╰─────────────────
`.trim())
}

handler.help    = ['addmoney <jumlah>']
handler.tags    = ['owner']
handler.command = /^(addmoney)$/i
handler.owner   = true
handler.exp     = 0

module.exports = handler

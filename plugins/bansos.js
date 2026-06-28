const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/bansos.js
// Klaim bantuan sosial 1x per hari — dapat 200.000–500.000 koin

const NARASI = [
    { cerita: 'Program Keluarga Harapan (PKH)', emoji: '🏠' },
    { cerita: 'Bantuan Pangan Non-Tunai (BPNT)', emoji: '🛒' },
    { cerita: 'Bantuan Langsung Tunai (BLT)', emoji: '💵' },
    { cerita: 'Subsidi BBM Konversi', emoji: '⛽' },
    { cerita: 'Dana Desa Produktif', emoji: '🌾' },
    { cerita: 'Bantuan UMKM Mikro', emoji: '🏪' },
    { cerita: 'Program Sembako Bersubsidi', emoji: '🧺' },
    { cerita: 'Kartu Prakerja Gelombang Spesial', emoji: '📋' },
]

let handler = async function (m, { usedPrefix }) {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar! Ketik .daftar dulu.'

    const now       = Date.now()
    const oneDay    = 24 * 60 * 60 * 1000
    const lastBansos= user.lastBansos || 0
    const sisaMs    = (lastBansos + oneDay) - now

    // Belum waktunya
    if (sisaMs > 0) {
        const jam = Math.floor(sisaMs / 3600000)
        const mnt = Math.floor((sisaMs % 3600000) / 60000)
        throw (
            `⏳ *Bansos sudah diklaim hari ini!*\n\n` +
            `Coba lagi dalam *${jam} jam ${mnt} menit*\n\n` +
            `_Bansos hanya bisa diklaim 1x per hari_`
        )
    }

    // Random uang 200.000–500.000
    const uang   = Math.floor(200000 + Math.random() * 300001)
    const narasi = NARASI[Math.floor(Math.random() * NARASI.length)]

    user.money     = (user.money || 0) + uang
    user.lastBansos = now
    await global.db.write()

    const tanggal = new Date().toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'Asia/Jakarta'
    })

    m.reply(
       `╭─「 ${narasi.emoji} *BANSOS CAIR!* 」\n│\n` +
       `│  👤 *${user.name || 'Penerima'}*\n` +
       `│  📋 Program: ${narasi.cerita}\n│\n` +
      ` │  💵 Dana diterima:\n` +
       `│  *+${uang.toLocaleString('id-ID')} koin*\n│\n` +
      ` │  💰 Total koin: ${(user.money).toLocaleString('id-ID')}\n` +
       `│  📅 Tanggal: ${tanggal}\n│\n` +
       `│  ⏰ Klaim lagi besok!\n` +
       `╰───────────────── `
    )
}

handler.help     = ['bansos - klaim bantuan sosial harian']
handler.tags     = ['ekonomi']
handler.command  = /^bansos$/i
handler.register = true
handler.exp      = 3

module.exports = handler
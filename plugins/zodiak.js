// zodiac.js - Cek zodiak & usia
// Baileys: atexovi-baileys

const zodiak = [
    ['Capricorn',   new Date(1970, 11, 22)],
    ['Sagittarius', new Date(1970, 10, 22)],
    ['Scorpio',     new Date(1970,  9, 23)],
    ['Libra',       new Date(1970,  8, 23)],
    ['Virgo',       new Date(1970,  7, 23)],
    ['Leo',         new Date(1970,  6, 23)],
    ['Cancer',      new Date(1970,  5, 22)],
    ['Gemini',      new Date(1970,  4, 21)],
    ['Taurus',      new Date(1970,  3, 21)],
    ['Aries',       new Date(1970,  2, 21)],
    ['Pisces',      new Date(1970,  1, 19)],
    ['Aquarius',    new Date(1970,  0, 20)],
    ['Capricorn',   new Date(1970,  0,  1)]
]

function getZodiac(month, day) {
    const d = new Date(1970, month - 1, day)
    return zodiak.find(([_, _d]) => d >= _d)[0]
}

let handler = (m, { usedPrefix, command, text }) => {
    if (!text) throw `Penggunaan:\n${usedPrefix + command} <tahun> <bulan> <tanggal>\n\nContoh:\n${usedPrefix + command} 2002 02 25`

    // Support format: "2002 02 25" atau "2002-02-25" atau "2002/02/25"
    const normalized = text.trim().replace(/[\s\/]+/g, '-')
    const date = new Date(normalized)
    if (isNaN(date.getTime())) throw `Format tanggal salah!\n\nContoh:\n${usedPrefix + command} 2002 02 25`

    const now        = new Date()
    const birthYear  = date.getFullYear()
    const birthMonth = date.getMonth() + 1
    const birthDay   = date.getDate()

    const nowYear  = now.getFullYear()
    const nowMonth = now.getMonth() + 1
    const nowDay   = now.getDate()

    // Hitung usia
    let age = nowYear - birthYear
    if (nowMonth < birthMonth || (nowMonth === birthMonth && nowDay < birthDay)) age--

    // Ultah mendatang
    let nextBirthdayYear = nowYear
    if (nowMonth > birthMonth || (nowMonth === birthMonth && nowDay >= birthDay)) {
        if (!(nowMonth === birthMonth && nowDay === birthDay)) nextBirthdayYear++
    }

    const zodiac    = getZodiac(birthMonth, birthDay)
    const isToday   = nowMonth === birthMonth && nowDay === birthDay
    const cekUsia   = isToday ? `Selamat ulang tahun yang ke-${age}! 🥳` : `${age} tahun`
    const nextBirth = `${nextBirthdayYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`
    const lahir     = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`

    const teks = `
╭─「 🎂 *CEK ZODIAK* 」
│
│  📅 *Lahir:* ${lahir}
│  🎉 *Ultah Mendatang:* ${nextBirth}
│  🎈 *Usia:* ${cekUsia}
│  ♈ *Zodiak:* ${zodiac}
│
╰─────────────────
`.trim()

    m.reply(teks)
}

handler.help    = ['zodiac *2002 02 25*']
handler.tags    = ['tools']
handler.command = /^zodia[kc]$/i

module.exports = handler
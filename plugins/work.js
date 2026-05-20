const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// work.js - Kerja untuk dapat koin
// Baileys: atexovi-baileys

const JOBS = [
    { id: 'programmer', nama: 'Programmer',    emoji: '💻', minKoin: 500000,  maxKoin: 1000000,  desc: 'Kamu nulis kode seharian penuh' },
    { id: 'pedagang',   nama: 'Pedagang',       emoji: '🛒', minKoin: 100000,  maxKoin: 300000,  desc: 'Kamu berjualan di pasar' },
    { id: 'petani',     nama: 'Petani',         emoji: '🌾', minKoin: 150000,  maxKoin: 200000,  desc: 'Kamu memanen hasil ladang' },
    { id: 'nelayan',    nama: 'Nelayan',        emoji: '🎣', minKoin: 90000,  maxKoin: 240000,  desc: 'Kamu melaut dan dapat banyak ikan' },
    { id: 'peternak',   nama: 'Peternak',       emoji: '🐄', minKoin: 80000,  maxKoin: 100000,  desc: 'Kamu merawat hewan ternak' },
    { id: 'kurir',      nama: 'Kurir',          emoji: '📦', minKoin: 50000,  maxKoin: 100000,  desc: 'Kamu antar paket kesana kemari' },
    { id: 'dokter',     nama: 'Dokter',         emoji: '⚕️', minKoin: 400000,  maxKoin: 900000,  desc: 'Kamu menangani banyak pasien' },
    { id: 'tentara',    nama: 'Tentara',        emoji: '⚔️', minKoin: 500000,  maxKoin: 700000,  desc: 'Kamu menjalankan misi berbahaya' },
    { id: 'hacker',     nama: 'Hacker',         emoji: '🕵️', minKoin: 200000,  maxKoin: 500000, desc: 'Kamu dapat bounty bug hunting' },
    { id: 'penambang',  nama: 'Penambang',      emoji: '⛏️', minKoin: 100000,  maxKoin: 250000,  desc: 'Kamu menambang di gua yang dalam' },
]

// Bonus item random dari kerja
const BONUS_ITEMS = [
    { item: 'petFood', nama: '🍖 Pet Food',  emoji: '🍖', chance: 0.2 },
    { item: 'kayu',    nama: '🪵 Kayu',      emoji: '🪵', chance: 0.3 },
    { item: 'batu',    nama: '🪨 Batu',      emoji: '🪨', chance: 0.3 },
    { item: 'besi',    nama: '⛏️ Besi',      emoji: '⛏️', chance: 0.15 },
]

const COOLDOWN = 2 * 60 * 60 * 1000  // 2 jam

let handler = async function (m, { usedPrefix, args }) {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar! Ketik *#daftar nama.umur* dulu.'

    const now      = Date.now()
    const lastWork = user.lastwork || 0
    const sisaMs   = (lastWork + COOLDOWN) - now

    if (sisaMs > 0) {
        const jam = Math.floor(sisaMs / (60 * 60 * 1000))
        const mnt = Math.floor((sisaMs % (60 * 60 * 1000)) / (60 * 1000))
        throw `⏳ Kamu masih lelah bekerja!\nIstirahat dulu, coba lagi dalam *${jam} jam ${mnt} menit*`
    }

    // Pilih pekerjaan random
    const job     = JOBS[Math.floor(Math.random() * JOBS.length)]
    const koin    = randInt(job.minKoin, job.maxKoin)

    // Bonus item random
    let bonusMsg  = ''
    let bonusItem = null
    for (const b of BONUS_ITEMS) {
        if (Math.random() < b.chance) {
            bonusItem = b
            const jumlah = randInt(1, 3)
            user[b.item] = (user[b.item] || 0) + jumlah
            bonusMsg = `│  🎁 *Bonus Item:* ${b.emoji} ${b.nama} x${jumlah}\n`
            break
        }
    }

    // Bonus koin kalau punya pet (pet bantu kerja)
    let petBonus = 0
    let petMsg   = ''
    if (user.pet && user.pet.hunger > 0) {
        petBonus = Math.floor(koin * 0.15)
        petMsg   = `│  🐾 *Bonus Pet (${user.pet.name}):* +${petBonus} koin\n`
    }

    const totalKoin   = koin + petBonus
    user.money        = (user.money || 0) + totalKoin
    user.lastwork     = now

    await global.db.write()

    m.reply(`
╭─「 ${job.emoji} *KERJA* 」
│
│  👤 *${user.name || 'User'}*
│  💼 *Profesi:* ${job.nama}
│  📝 ${job.desc}
│
│  💵 *Koin Didapat:* +${koin.toLocaleString('id-ID')}
${petMsg}${bonusMsg}│  💰 *Total Koin:* ${(user.money).toLocaleString('id-ID')}
│
│  ⏰ Bisa kerja lagi dalam *2 jam*
╰─────────────────
`.trim())
}

handler.help    = ['work', 'kerja']
handler.tags    = ['rpg', 'game']
handler.command = /^(work|kerja)$/i
handler.owner   = false
handler.mods    = false
handler.premium = false
handler.group   = false
handler.private = false
handler.admin   = false
handler.botAdmin = false
handler.exp     = 8
handler.register = true

module.exports = handler

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}
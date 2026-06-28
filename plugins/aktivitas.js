const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/aktivitas.js
// ════════════════════════════════════════════════════════════════════
//  🎣 AKTIVITAS — Memancing, Mining, Berkebun, Mulung
//
//  Command:
//    .mancing          → memancing ikan (cooldown 30 menit)
//    .mining           → menambang batu/besi/emas/berlian (CD 1 jam)
//    .kebun / .tanam   → berkebun, hasilkan bahan makanan (CD 45 menit)
//    .mulung           → mulung sampah jadi koin (CD 20 menit)
// ════════════════════════════════════════════════════════════════════

const fmt = n => Number(n || 0).toLocaleString('id-ID')

const CD = {
    mancing : 30 * 60 * 1000,   // 30 menit
    mining  : 60 * 60 * 1000,   // 1 jam
    kebun   : 45 * 60 * 1000,   // 45 menit
    mulung  : 20 * 60 * 1000,   // 20 menit
}

function fmtCD(ms) {
    const s = Math.ceil(ms / 1000)
    const m = Math.floor(s / 60), sec = s % 60
    const h = Math.floor(m / 60), min = m % 60
    if (h > 0) return `${h} jam ${min} menit`
    if (m > 0) return `${m} menit ${sec} detik`
    return `${sec} detik`
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function checkCD(user, key) {
    const last  = user[key] || 0
    const sisa  = last + CD[key] - Date.now()
    return sisa > 0 ? sisa : 0
}

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

// ── Item & hasil ──────────────────────────────────────────────────

const IKAN = [
    { nama: '🐟 Ikan Biasa',     item: 'ikanBiasa',  nilai: 80,  chance: 40 },
    { nama: '🐠 Ikan Tropis',    item: 'ikanTropis', nilai: 200, chance: 25 },
    { nama: '🦐 Udang Besar',    item: 'money',      nilai: 350, chance: 15 },
    { nama: '🐡 Ikan Fugu',      item: 'money',      nilai: 600, chance: 10 },
    { nama: '🦑 Cumi Raksasa',   item: 'money',      nilai: 1200,chance: 7  },
    { nama: '💎 Ikan Langka',    item: 'money',      nilai: 3000,chance: 3  },
]

const TAMBANG = [
    { nama: '🪨 Batu',    item: 'batu',    qty: [3, 8],  chance: 45 },
    { nama: '🪵 Kayu',    item: 'kayu',    qty: [2, 6],  chance: 25 },
    { nama: '⚙️ Besi',    item: 'iron',    qty: [1, 4],  chance: 15 },
    { nama: '🥇 Emas',    item: 'gold',    qty: [1, 3],  chance: 10 },
    { nama: '💎 Berlian', item: 'diamond', qty: [1, 2],  chance: 5  },
]

const KEBUN = [
    { nama: '🌾 Gandum',  item: 'money',   nilai: 120, chance: 35 },
    { nama: '🥕 Wortel',  item: 'money',   nilai: 200, chance: 25 },
    { nama: '🌽 Jagung',  item: 'money',   nilai: 280, chance: 20 },
    { nama: '🍅 Tomat',   item: 'money',   nilai: 380, chance: 12 },
    { nama: '🍓 Stroberi',item: 'money',   nilai: 700, chance: 6  },
    { nama: '🌿 Herbal',  item: 'potion',  nilai: 1,   chance: 2  },
]

const MULUNG_ITEM = [
    { nama: '🗑️ Sampah Biasa',  item: 'sampah', qty: [5, 15],  chance: 45 },
    { nama: '📦 Kardus Bekas',  item: 'money',  nilai: 150,    chance: 25 },
    { nama: '🔩 Besi Rongsokan',item: 'iron',   qty: [1, 3],   chance: 15 },
    { nama: '💰 Dompet Jatuh',  item: 'money',  nilai: 500,    chance: 10 },
    { nama: '💍 Perhiasan',     item: 'money',  nilai: 2000,   chance: 5  },
]

function pickItem(table) {
    const total = table.reduce((a, b) => a + b.chance, 0)
    let r = Math.random() * total
    for (const item of table) {
        r -= item.chance
        if (r <= 0) return item
    }
    return table[0]
}

// ── Narasi aktivitas ──────────────────────────────────────────────

const NARASI_MANCING = [
    '🎣 Kamu melempar kail ke sungai... sabar menunggu...',
    '🌊 Ombak tenang. Kamu duduk di tepi, mata tertuju pada pelampung...',
    '🎣 Cuaca bagus hari ini. Kail kamu langsung disambut!',
]
const NARASI_MINING = [
    '⛏️ Kamu mengayunkan palu ke dinding gua...',
    '🪨 Bebatuan berjatuhan. Keringat mengucur. Tapi sesuatu bersinar di kegelapan...',
    '⚒️ Kamu menggali lebih dalam. Gua ini menyimpan banyak rahasia...',
]
const NARASI_KEBUN = [
    '🌱 Kamu mencangkul tanah, menanam benih dengan penuh harapan...',
    '☀️ Terik matahari tidak menghentikanmu. Ladangmu semakin hijau!',
    '🌿 Tangan kotor tapi hati senang. Panen kali ini lumayan!',
]
const NARASI_MULUNG = [
    '🚶 Kamu berjalan menyusuri gang sempit, mata jeli mencari barang berguna...',
    '♻️ Tumpukan sampah tidak menghalangimu. Ada rezeki di balik rongsokan!',
    '🔦 Dengan senter kecil, kamu menyisiri TPA. Siapa tahu ada yang berharga...',
]

function pickNarasi(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

// ── Handler ───────────────────────────────────────────────────────
let handler = async (m, { conn, command, usedPrefix }) => {
    const cmd  = command.toLowerCase()
    const user = getDbUser(m.sender)
    if (!user || !user.registered) return m.reply('❌ Kamu belum daftar! Ketik *.daftar* dulu.')

    // ── MANCING ──────────────────────────────────────────────────
    if (/^(mancing|pancing|fishing)$/.test(cmd)) {
        const sisa = checkCD(user, 'mancing')
        if (sisa) return m.reply(`⏳ *Kamu masih kelelahan memancing!*\nTunggu *${fmtCD(sisa)}* lagi.\n\n🎣 CD: 30 menit`)

        const narasi = pickNarasi(NARASI_MANCING)
        await m.reply(narasi)
        await new Promise(r => setTimeout(r, 2000))

        const hasil = pickItem(IKAN)
        let hasilStr = ''

        if (hasil.item === 'money') {
            const bonus = randInt(Math.floor(hasil.nilai * 0.8), Math.floor(hasil.nilai * 1.2))
            user.money = (user.money || 0) + bonus
            hasilStr = `💰 *+${fmt(bonus)} koin*`
        } else {
            user[hasil.item] = (user[hasil.item] || 0) + 1
            hasilStr = `📦 *+1 ${hasil.nama}* (disimpan di inventori)`
        }

        user.lastfishing = Date.now()
        await saveDB()

        return m.reply(
            `🎣 *HASIL MANCING*\n\n` +
            `🐟 Dapat: *${hasil.nama}*\n` +
            `${hasilStr}\n\n` +
            `💰 Saldo: ${fmt(user.money)} koin\n` +
            `⏳ CD selanjutnya: 30 menit`
        )
    }

    // ── MINING ───────────────────────────────────────────────────
    if (/^(mining|tambang|gali)$/.test(cmd)) {
        const sisa = checkCD(user, 'mining')
        if (sisa) return m.reply(`⏳ *Kamu masih kelelahan menambang!*\nTunggu *${fmtCD(sisa)}* lagi.\n\n⛏️ CD: 1 jam`)

        const hasPickaxe = (user.pickaxe || 0) > 0
        const narasi     = pickNarasi(NARASI_MINING)
        await m.reply(narasi + (hasPickaxe ? '\n\n⛏️ _Kamu menggunakan pickaxe!_' : ''))
        await new Promise(r => setTimeout(r, 2000))

        // Bisa dapat 2 item kalau pakai pickaxe
        const rounds  = hasPickaxe ? 2 : 1
        const results = []

        for (let i = 0; i < rounds; i++) {
            const hasil = pickItem(TAMBANG)
            const qty   = randInt(hasil.qty[0], hasil.qty[1])
            user[hasil.item] = (user[hasil.item] || 0) + qty
            results.push(`${hasil.nama} x${qty}`)
        }

        // Kurangi durabilitas pickaxe
        if (hasPickaxe) {
            user.pickaxedurability = (user.pickaxedurability || 0) - 1
            if (user.pickaxedurability <= 0) {
                user.pickaxe = 0
                user.pickaxedurability = 0
                results.push('⚠️ _Pickaxe rusak!_')
            }
        }

        user.lastmining = Date.now()
        await saveDB()

        return m.reply(
            `⛏️ *HASIL MINING*\n\n` +
            `📦 Dapat:\n${results.map(r => `• ${r}`).join('\n')}\n\n` +
            `🗃️ Cek inventori: *.inventori*\n` +
            `⏳ CD selanjutnya: 1 jam`
        )
    }

    // ── KEBUN ────────────────────────────────────────────────────
    if (/^(kebun|tanam|bertani|farming)$/.test(cmd)) {
        const sisa = checkCD(user, 'kebun')
        if (sisa) return m.reply(`⏳ *Kebunmu belum siap panen!*\nTunggu *${fmtCD(sisa)}* lagi.\n\n🌱 CD: 45 menit`)

        const narasi = pickNarasi(NARASI_KEBUN)
        await m.reply(narasi)
        await new Promise(r => setTimeout(r, 2000))

        // Dapat 2-4 hasil panen
        const jumlah = randInt(2, 4)
        let totalKoin = 0
        let totalPotion = 0
        const hasil = []

        for (let i = 0; i < jumlah; i++) {
            const item = pickItem(KEBUN)
            if (item.item === 'money') {
                const bonus = randInt(Math.floor(item.nilai * 0.8), Math.floor(item.nilai * 1.2))
                totalKoin += bonus
                hasil.push(`${item.nama} (+${fmt(bonus)} koin)`)
            } else if (item.item === 'potion') {
                user.potion = (user.potion || 0) + 1
                totalPotion++
                hasil.push(`${item.nama} (+1 Potion)`)
            }
        }

        if (totalKoin > 0) user.money = (user.money || 0) + totalKoin
        user.lastwork = Date.now()
        await saveDB()

        return m.reply(
            `🌾 *HASIL BERKEBUN*\n\n` +
            `📦 Panen:\n${hasil.map(r => `• ${r}`).join('\n')}\n\n` +
            `💰 Total koin: +${fmt(totalKoin)}\n` +
            `💰 Saldo: ${fmt(user.money)} koin\n` +
            `⏳ CD selanjutnya: 45 menit`
        )
    }

    // ── MULUNG ───────────────────────────────────────────────────
    if (/^(mulung|rongsokan|scavenge)$/.test(cmd)) {
        const sisa = checkCD(user, 'mulung')
        if (sisa) return m.reply(`⏳ *Area mulung belum ada barang baru!*\nTunggu *${fmtCD(sisa)}* lagi.\n\n♻️ CD: 20 menit`)

        const narasi = pickNarasi(NARASI_MULUNG)
        await m.reply(narasi)
        await new Promise(r => setTimeout(r, 2000))

        const hasil  = pickItem(MULUNG_ITEM)
        let hasilStr = ''

        if (hasil.item === 'money') {
            const bonus = randInt(Math.floor(hasil.nilai * 0.8), Math.floor(hasil.nilai * 1.2))
            user.money = (user.money || 0) + bonus
            hasilStr = `💰 *+${fmt(bonus)} koin*`
        } else {
            const qty = randInt(hasil.qty[0], hasil.qty[1])
            user[hasil.item] = (user[hasil.item] || 0) + qty
            hasilStr = `📦 *${hasil.nama} x${qty}*`
            if (hasil.item === 'sampah') {
                // Konversi sampah ke koin otomatis (5 koin/sampah)
                const koinSampah = qty * 5
                user.money = (user.money || 0) + koinSampah
                hasilStr += ` → +${fmt(koinSampah)} koin`
            }
        }

        user.lastwork = Date.now()
        await saveDB()

        return m.reply(
            `♻️ *HASIL MULUNG*\n\n` +
            `🗑️ Temuan: *${hasil.nama}*\n` +
            `${hasilStr}\n\n` +
            `💰 Saldo: ${fmt(user.money)} koin\n` +
            `⏳ CD selanjutnya: 20 menit`
        )
    }
}

handler.help = [
    'mancing — memancing ikan (CD 30 menit)',
    'mining — menambang (CD 1 jam)',
    'kebun — berkebun (CD 45 menit)',
    'mulung — mulung rongsokan (CD 20 menit)',
]
handler.tags     = ['rpg']
handler.command  = /^(mancing|pancing|fishing|mining|tambang|gali|kebun|tanam|bertani|farming|mulung|rongsokan|scavenge)$/i
handler.register = true
handler.exp      = 5

module.exports = handler
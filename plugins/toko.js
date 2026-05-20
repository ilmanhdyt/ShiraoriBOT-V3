const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// toko.js - Toko, Beli, dan Jual item
// Command: buy, sell, toko/shop

const CHICKEN_NAMES = [
    'Jago Merah', 'Si Bongkok', 'Petarung Emas', 'Cakar Besi',
    'Badai Sayap', 'Sang Juara', 'Raja Kandang', 'Si Kilat',
    'Pendekar Paruh', 'Ayam Liar'
]

function generateChicken() {
    return {
        name: CHICKEN_NAMES[Math.floor(Math.random() * CHICKEN_NAMES.length)],
        hp: 80 + Math.floor(Math.random() * 41),
        atk: 10 + Math.floor(Math.random() * 11),
        def: 3 + Math.floor(Math.random() * 8),
        spd: 5 + Math.floor(Math.random() * 11),
        win: 0, lose: 0, level: 1, exp: 0,
    }
}

const fmt = n => Number(n || 0).toLocaleString('id-ID')

const SPECIAL_ITEMS = {
    chicken: {
        label: '🐓 Ayam Sabung',
        harga: 500000,
        desc: 'Ayam untuk sabung (cockfight)',
        once: true,
    },
    limitjudi: {
        label: '🎰 +Limit Judi',
        harga: 250000,
        desc: 'Tambah 5x limit judi harian',
        maxPerDay: 10,
    },
    limit: {
        label: '⚡ +Limit Bot',
        harga: 100000,
        desc: 'Tambah 5x limit bot',
    },
    cincin: {
        label: '💍 Cincin Nikah',
        harga: 10_000_000,
        desc: 'Cincin untuk melamar / menikah',
    },
    pembesaranak: {
    label : '🍼 Pembesar Anak',
    harga : 100_000_000_000_000_000_000_000,
    desc  : 'Besarkan anak satu fase secara instan',
},
}

let handler = async (m, { args, usedPrefix, command }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar!'

    const cfg = global.EKONOMI_CONFIG
    if (!cfg) throw '❌ Sistem ekonomi belum dimuat!'

    const cmd = command.toLowerCase()

    if (cmd === 'toko' || cmd === 'shop') {
        const tokoList = Object.entries(cfg.toko)
            .filter(([k]) => k !== 'potion')
            .map(([, v]) => `│  ${v.label.padEnd(18)} 💵 ${fmt(v.harga)} rupiah`)
            .join('\n')

        const specialList = Object.entries(SPECIAL_ITEMS)
            .map(([, v]) => `│  ${v.label.padEnd(18)} 💵 ${fmt(v.harga)} rupiah — ${v.desc}`)
            .join('\n')

        const jualList = Object.entries(cfg.jual)
            .filter(([k]) => k !== 'potion')
            .map(([key, harga]) => {
                const emoji = {
                    petFood: '🍖',
                    kayu: '🪵',
                    batu: '🪨',
                    iron: '⚙️',
                    emerald: '💚',
                    diamond: '💎',
                    gold: '👑',
                    sampah: '🗑️'
                }[key] || '📦'
                return `│  ${(emoji + ' ' + key).padEnd(18)} 💵 ${fmt(harga)} rupiah`
            })
            .join('\n')

        return m.reply(`
╭─「 🏪 *TOKO* 」
│
├─「 🛒 *Item Biasa* 」
${tokoList}
│
├─「 ✨ *Item Spesial* 」
${specialList}
│
│  Cara beli: *${usedPrefix}buy <item> [jumlah]*
│  Contoh: *${usedPrefix}buy petFood 5*
│           *${usedPrefix}buy chicken*
│           *${usedPrefix}buy limit*
│           *${usedPrefix}buy limitjudi 3*
│
├─「 💰 *Harga Jual* 」
${jualList}
│
│  Cara jual: *${usedPrefix}sell <item> <jumlah>*
│  💵 Rupiah kamu: ${fmt(user.money)}
╰─────────────────
`.trim())
    }

    if (cmd === 'buy') {
        const input = (args[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
        const jumlah = parseInt(args[1]) || 1

        if (!input) throw `❌ Ketik item yang mau dibeli!\nContoh: *${usedPrefix}buy petFood 3*`

        if (input === 'chicken') {
            if (user.chicken) throw (
                `❌ Kamu sudah punya ayam!\n\n` +
                `🐓 *${user.chicken.name}*\n` +
                `❤️ HP: ${user.chicken.hp} | ⚔️ ATK: ${user.chicken.atk}\n` +
                `🏆 Menang: ${user.chicken.win} | Kalah: ${user.chicken.lose}`
            )
            if ((user.money || 0) < SPECIAL_ITEMS.chicken.harga) {
                throw `❌ Uang tidak cukup!\n🐓 Harga: ${fmt(SPECIAL_ITEMS.chicken.harga)} rupiah\n💵 Punya: ${fmt(user.money)} rupiah`
            }

            user.money -= SPECIAL_ITEMS.chicken.harga
            user.chicken = generateChicken()
            await global.db.write()

            return m.reply(
                `🎉 *Ayam berhasil dibeli!*\n\n` +
                `🐓 Nama: *${user.chicken.name}*\n` +
                `❤️ HP: ${user.chicken.hp} | ⚔️ ATK: ${user.chicken.atk}\n` +
                `🛡️ DEF: ${user.chicken.def} | 💨 SPD: ${user.chicken.spd}\n\n` +
                `💰 Sisa: ${fmt(user.money)} rupiah`
            )
        }

        if (input === 'cincin') {
            const harga = SPECIAL_ITEMS.cincin.harga
            const beli = Math.max(1, Math.min(jumlah, 10))
            const total = harga * beli

            if ((user.money || 0) < total) {
                throw `❌ Uang tidak cukup!\n💍 Harga: ${fmt(total)} rupiah (${beli}x)\n💵 Punya: ${fmt(user.money)} rupiah`
            }

            user.money -= total
            user.cincin = (user.cincin || 0) + beli
            await global.db.write()

            return m.reply(
                `💍 *Cincin Nikah berhasil dibeli!*\n\n` +
                `│  💍 Cincin x${beli}\n` +
                `│  💵 Bayar: ${fmt(total)} rupiah\n` +
                `│  💰 Sisa: ${fmt(user.money)} rupiah\n` +
                `│  💍 Total cincin: ${user.cincin}\n\n` +
                `_Siap melamar! Ketik .lamar @user atau .lamar npc_`
            )
        }
        
        // PEMBESAR ANAK
if (input === 'pembesaranak') {
    const harga = SPECIAL_ITEMS.pembesaranak.harga
    const total = harga * jumlah

    const diDompet = user.money || 0
const diBank   = user.bank || 0
const totalAset = diDompet + diBank

if (totalAset < total)
    throw `❌ Uang tidak cukup!\n🍼 Harga: ${fmt(total)} rupiah (${jumlah}x)\n💵 Dompet: ${fmt(diDompet)}\n🏦 Bank: ${fmt(diBank)}`

// Pakai dompet dulu, kekurangannya ambil dari bank
if (diDompet >= total) {
    user.money -= total
} else {
    const sisaDariBank = total - diDompet
    user.money = 0
    user.bank  = diBank - sisaDariBank
}
    user.pembesaranak = (user.pembesaranak || 0) + jumlah
    await global.db.write()
    return m.reply(
        `🎉 *Berhasil beli Item Pembesar Anak!*\n\n` +
        `🍼 Jumlah: *${jumlah}x*\n` +
        `💰 Bayar: ${fmt(total)} rupiah\n` +
        `💵 Sisa: ${fmt(user.money)} rupiah\n\n` +
        `Gunakan: *${usedPrefix}pembesaranak <nomor anak>*`
    )
}

        if (input === 'limitjudi') {
            const harga = SPECIAL_ITEMS.limitjudi.harga
            const beli = Math.max(1, Math.min(jumlah, 10))
            const total = harga * beli
            const tambahLimit = beli * 5

            if ((user.money || 0) < total) {
                throw `❌ Uang tidak cukup!\n🎰 Harga: ${fmt(total)} rupiah (${beli}x)\n💵 Punya: ${fmt(user.money)} rupiah`
            }

            const today = new Date().toISOString().slice(0, 10)
            if (user.judiDate !== today) {
                user.judiDate = today
                user.judiCount = 0
                user.judiBonusLimit = 0
            }
            if (!user.judiBonusLimit) user.judiBonusLimit = 0

            user.money -= total
            user.judiBonusLimit = (user.judiBonusLimit || 0) + tambahLimit
            await global.db.write()

            return m.reply(
                `✅ *Limit Judi ditambah!*\n\n` +
                `🎰 +${tambahLimit}x limit judi hari ini\n` +
                `💵 Bayar: ${fmt(total)} rupiah\n` +
                `💰 Sisa: ${fmt(user.money)} rupiah\n\n` +
                `📊 Total limit judi hari ini: ${10 + (user.judiBonusLimit || 0)}x`
            )
        }

        if (input === 'limit') {
            const harga = SPECIAL_ITEMS.limit.harga
            const tambah = 5

            if ((user.money || 0) < harga) {
                throw `❌ Uang tidak cukup!\n\n⚡ Harga: ${fmt(harga)} rupiah\n💵 Punya: ${fmt(user.money)} rupiah`
            }

            user.money -= harga
            user.limit = (user.limit || 0) + tambah
            await global.db.write()

            return m.reply(
                `✅ *Limit berhasil dibeli!*\n\n` +
                `⚡ +${tambah} limit\n` +
                `💵 Bayar: ${fmt(harga)} rupiah\n` +
                `💰 Sisa: ${fmt(user.money)} rupiah\n` +
                `📊 Limit sekarang: ${user.limit}`
            )
        }

        const itemKey = Object.keys(cfg.toko)
            .filter(k => k !== 'potion')
            .find(v => v.toLowerCase().replace(/[^a-z0-9]/g, '') === input)

        if (!itemKey) {
            const list = [...Object.keys(cfg.toko).filter(k => k !== 'potion'), ...Object.keys(SPECIAL_ITEMS)].join(', ')
            throw `❌ Item tidak ditemukan!\nItem tersedia: ${list}`
        }

        const itemData = cfg.toko[itemKey]
        if (jumlah <= 0 || jumlah > 100) throw '❌ Jumlah harus antara 1-100!'

        const totalHarga = itemData.harga * jumlah
        if ((user.money || 0) < totalHarga) {
            throw `❌ Uang tidak cukup!\n💵 Harga: ${fmt(totalHarga)} rupiah\n💵 Punya: ${fmt(user.money)} rupiah`
        }

        user.money -= totalHarga
        user[itemData.item] = (user[itemData.item] || 0) + jumlah
        await global.db.write()

        return m.reply(
            `✅ *Berhasil membeli!*\n\n` +
            `│  ${itemData.label} x${jumlah}\n` +
            `│  💵 Bayar: ${fmt(totalHarga)} rupiah\n` +
            `│  💰 Sisa rupiah: ${fmt(user.money)}`
        )
    }

    if (cmd === 'sell') {
        const itemKey = (args[0] || '').toLowerCase()
        const jumlah = parseInt(args[1]) || 1

        if (!itemKey) throw `❌ Ketik item yang mau dijual!\nContoh: *${usedPrefix}sell kayu 10*`
        if (itemKey === 'potion') throw '❌ Potion tidak bisa dijual!'

        const hargaJual = cfg.jual[itemKey]
        if (!hargaJual) {
            const list = Object.keys(cfg.jual).filter(k => k !== 'potion').join(', ')
            throw `❌ Item tidak bisa dijual!\nItem yang bisa dijual: ${list}`
        }

        const stok = user[itemKey] || 0
        if (stok <= 0) throw `❌ Kamu tidak punya ${itemKey}!`
        if (jumlah > stok) throw `❌ Stok tidak cukup!\nPunya: ${stok} ${itemKey}`
        if (jumlah <= 0 || jumlah > 9999) throw '❌ Jumlah tidak valid!'

        const totalDapat = hargaJual * jumlah
        user[itemKey] = stok - jumlah
        user.money = (user.money || 0) + totalDapat
        await global.db.write()

        return m.reply(
            `✅ *Berhasil menjual!*\n\n` +
            `│  📦 ${itemKey} x${jumlah}\n` +
            `│  💵 Dapat: +${fmt(totalDapat)} rupiah\n` +
            `│  💰 Total rupiah: ${fmt(user.money)}`
        )
    }
}

handler.help = ['toko', 'buy <item> [jumlah]', 'sell <item> <jumlah>']
handler.tags = ['rpg']
handler.command = /^(toko|shop|buy|sell)$/i
handler.owner = false
handler.register = true
handler.exp = 3

module.exports = handler
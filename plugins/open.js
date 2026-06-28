const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/open.js — Buka Legendary Crate & Pet Crate
// Didapat dari weekly/monthly

const LEGENDARY_ITEMS = [
    { item: 'diamond', label: '💎 Diamond',   min: 1,  max: 3,  chance: 20 },
    { item: 'gold',    label: '👑 Gold',       min: 2,  max: 5,  chance: 25 },
    { item: 'emerald', label: '💚 Emerald',    min: 3,  max: 8,  chance: 25 },
    { item: 'iron',    label: '⚙️ Besi',       min: 5,  max: 15, chance: 20 },
    { item: 'money',   label: '💵 Koin',       min: 5000, max: 50000, chance: 10 },
]

const PET_CRATE_ITEMS = [
    { item: 'kuda',   label: '🐴 Kuda',   chance: 15 },
    { item: 'kucing', label: '🐱 Kucing', chance: 30 },
    { item: 'rubah',  label: '🦊 Rubah',  chance: 25 },
    { item: 'anjing', label: '🐶 Anjing', chance: 30 },
]

function roll(items) {
    const total = items.reduce((a, b) => a + b.chance, 0)
    let r = Math.random() * total
    for (const i of items) {
        r -= i.chance
        if (r <= 0) return i
    }
    return items[items.length - 1]
}

const fmt = n => Number(n || 0).toLocaleString('id-ID')

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar!'

    const input  = (args[0] || '').toLowerCase().replace(/[^a-z]/g, '')
    const jumlah = Math.max(1, Math.min(parseInt(args[1]) || 1, 50))

    // ── OPEN LEGENDARY ─────────────────────────────────────────────
    if (input === 'legendary' || input === 'leg') {
        const punya = user.legendary || 0
        if (punya <= 0) throw `❌ Kamu tidak punya Legendary Crate!\nDapatkan dari *.weekly* dan *.monthly*`
        if (jumlah > punya) throw `❌ Crate tidak cukup!\nPunya: ${punya} Legendary Crate`

        const hasil = []
        for (let i = 0; i < jumlah; i++) {
            const item = roll(LEGENDARY_ITEMS)
            const qty  = item.item === 'money'
                ? Math.floor(Math.random() * (item.max - item.min + 1)) + item.min
                : Math.floor(Math.random() * (item.max - item.min + 1)) + item.min

            user[item.item] = (user[item.item] || 0) + qty
            const existing  = hasil.find(h => h.label === item.label)
            if (existing) existing.qty += qty
            else hasil.push({ label: item.label, qty, item: item.item })
        }
        user.legendary -= jumlah

        await global.db.write()

        const hasilStr = hasil.map(h =>
            `│  ${h.label}: +${h.item === 'money' ? fmt(h.qty) : h.qty}`
        ).join('\n')

        return m.reply(`
╭─「 🎁 *LEGENDARY CRATE* 」
│  Dibuka: ${jumlah}x
│
├─「 ✨ *Hasil* 」
${hasilStr}
│
│  📦 Sisa: ${user.legendary} Legendary Crate
╰─────────────────
`.trim())
    }

    // ── OPEN PET CRATE ─────────────────────────────────────────────
    if (input === 'pet' || input === 'petcrate') {
        const punya = user.pet || 0
        if (punya <= 0) throw `❌ Kamu tidak punya Pet Crate!\nDapatkan dari *.monthly*`
        if (jumlah > punya) throw `❌ Crate tidak cukup!\nPunya: ${punya} Pet Crate`

        const hasil = []
        for (let i = 0; i < jumlah; i++) {
            const item = roll(PET_CRATE_ITEMS)
            user[item.item] = (user[item.item] || 0) + 1
            const existing  = hasil.find(h => h.label === item.label)
            if (existing) existing.qty++
            else hasil.push({ label: item.label, qty: 1 })
        }
        user.pet = (user.pet || 0) - jumlah

        await global.db.write()

        const hasilStr = hasil.map(h => `│  ${h.label}: +${h.qty}`).join('\n')

        return m.reply(`
╭─「 📦 *PET CRATE* 」
│  Dibuka: ${jumlah}x
│
├─「 🐾 *Hasil* 」
${hasilStr}
│
│  📦 Sisa: ${user.pet || 0} Pet Crate
╰─────────────────
`.trim())
    }

    // Info jika tidak ada arg
    return m.reply(`
╭─「 🎁 *OPEN CRATE* 」
│
│  *.open legendary [jumlah]*
│  Buka Legendary Crate (dari weekly/monthly)
│  📦 Punya: ${user.legendary || 0}x
│
│  *.open pet [jumlah]*
│  Buka Pet Crate (dari monthly)
│  📦 Punya: ${user.pet || 0}x
│
╰─────────────────
`.trim())
}

handler.help    = ['open legendary [jumlah]', 'open pet [jumlah]']
handler.tags    = ['rpg']
handler.command = /^(open)$/i
handler.register = true
handler.exp     = 0

module.exports = handler

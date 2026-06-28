const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/hunting.js — Sistem Berburu RPG
// Command: .hunting | .hunt

const COOLDOWN = 30 * 60 * 1000 // 30 menit

const PREY = [
    {
        name: 'Kelinci',  emoji: '🐇',
        minLv: 1, chance: 0.65,
        money: [50, 200], exp: [5, 15],
        loot : [
            { item: 'petFood', emoji: '🍖', label: 'Daging Kelinci', min: 1, max: 3 },
            { item: 'kayu',    emoji: '🪵', label: 'Kayu',           min: 1, max: 2 },
        ]
    },
    {
        name: 'Rusa',  emoji: '🦌',
        minLv: 5, chance: 0.40,
        money: [200, 600], exp: [20, 40],
        loot : [
            { item: 'petFood', emoji: '🍖', label: 'Daging Rusa', min: 2, max: 5 },
            { item: 'batu',    emoji: '🪨', label: 'Batu',        min: 1, max: 3 },
            { item: 'iron',    emoji: '⚙️', label: 'Besi',        min: 1, max: 2 },
        ]
    },
    {
        name: 'Beruang',  emoji: '🐻',
        minLv: 15, chance: 0.25,
        money: [500, 1200], exp: [40, 70],
        loot : [
            { item: 'petFood', emoji: '🍖', label: 'Daging Beruang', min: 3, max: 6 },
            { item: 'iron',    emoji: '⚙️', label: 'Besi',           min: 2, max: 4 },
            { item: 'emerald', emoji: '💚', label: 'Emerald',         min: 1, max: 1 },
        ]
    },
    {
        name: 'Naga',  emoji: '🐉',
        minLv: 40, chance: 0.10,
        money: [3000, 8000], exp: [200, 350],
        loot : [
            { item: 'diamond',  emoji: '💎', label: 'Sisik Naga (Diamond)', min: 1, max: 3 },
            { item: 'gold',     emoji: '👑', label: 'Gold',                 min: 2, max: 5 },
            { item: 'legendary',emoji: '🎁', label: 'Legendary Crate',      min: 1, max: 1 },
        ]
    },
]

const FAIL_EVENTS = [
    '🐾 Buruanmu kabur masuk hutan lebat...',
    '💨 Angin kencang mengacaukan incaran kamu.',
    '🐍 Kamu malah ketemu ular, mundur dulu!',
    '🌧️ Hujan deras — jejak buruan hilang.',
]

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

let handler = async (m, { usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    const now     = Date.now()
    const lastHnt = user.lastHunting || 0
    const sisaMs  = (lastHnt + COOLDOWN) - now

    if (sisaMs > 0) {
        const mnt = Math.floor(sisaMs / 60000)
        const dtk = Math.floor((sisaMs % 60000) / 1000)
        throw `⏳ Kamu masih kelelahan berburu!\nCoba lagi dalam *${mnt}m ${dtk}d*`
    }

    const lv = user.level || 1

    // Filter buruan sesuai level
    const available = PREY.filter(p => lv >= p.minLv)
    if (!available.length) available.push(PREY[0])

    // Pilih buruan berdasarkan kesempatan (yang lebih rare lebih kecil chance)
    // Ambil yang levelnya terpenuhi, sort dari rare ke common
    const sorted = [...available].reverse()
    let target = sorted[sorted.length - 1] // default kelinci
    for (const p of sorted) {
        if (Math.random() < p.chance) {
            target = p
            break
        }
    }

    user.lastHunting = now

    // Chance gagal berburu (15%)
    if (Math.random() < 0.15) {
        await global.db.write()
        const failMsg = FAIL_EVENTS[randInt(0, FAIL_EVENTS.length - 1)]
        return m.reply(`
╭─「 🏹 *BERBURU — GAGAL* 」
│
│  ${failMsg}
│
│  ⏰ Coba lagi dalam 30 menit!
╰─────────────────────────────`.trim())
    }

    // Berhasil berburu
    const moneyGain = randInt(target.money[0], target.money[1])
    const expGain   = randInt(target.exp[0], target.exp[1])

    user.money = (user.money || 0) + moneyGain
    user.exp   = (user.exp   || 0) + expGain

    // Bonus attack jika punya sword equipped
    const swBonus = (user.equippedSword || 0) * 0.05
    const bonusMoney = Math.floor(moneyGain * swBonus)
    if (bonusMoney > 0) user.money += bonusMoney

    // Loot
    const lootLines = []
    for (const l of target.loot) {
        if (Math.random() < 0.6) {
            const qty = randInt(l.min, l.max)
            user[l.item] = (user[l.item] || 0) + qty
            lootLines.push(`${l.emoji} ${l.label} x${qty}`)
        }
    }

    await global.db.write()

    const lootText = lootLines.length
        ? `│\n│  🎒 *Item Didapat:*\n│  ${lootLines.join('\n│  ')}`
        : ''

    const bonusText = bonusMoney > 0
        ? `\n│  ⚔️ *Bonus Sword:* +${bonusMoney.toLocaleString('id-ID')} rupiah`
        : ''

    const nagaTag = target.name === 'Naga' ? '\n│  🔥 *[NAGA LANGKA!]*' : ''

    return m.reply(`
╭─「 🏹 *BERBURU — BERHASIL!* 」
│${nagaTag}
│  ${target.emoji} *${target.name}* berhasil ditangkap!
│
│  ⭐ EXP   : +${expGain}
│  💰 rupiah  : +${moneyGain.toLocaleString('id-ID')}${bonusText}${lootText}
│
│  💰 Total : ${(user.money).toLocaleString('id-ID')} rupiah
│  ⏰ Berburu lagi dalam 30 menit
╰─────────────────────────────`.trim())
}

handler.help     = ['hunting', 'hunt', 'berburu']
handler.tags     = ['rpg']
handler.command  = /^(hunting|hunt|berburu)$/i
handler.register = true
handler.exp      = 5
handler.limit    = false

module.exports = handler

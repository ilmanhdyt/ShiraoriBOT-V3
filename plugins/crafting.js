const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/crafting.js — Sistem Crafting RPG
// Command: .crafting | .craft <nama_resep>

// ═══════════════════════════════════════════════════════════════
// RESEP
// ═══════════════════════════════════════════════════════════════
const RECIPES = [
    // ── Weapon ───────────────────────────────────────────────────
    {
        id     : 'sword_basic',
        name   : 'Basic Sword',
        emoji  : '⚔️',
        result : { item: 'sword', qty: 1 },
        mat    : [{ item: 'kayu', qty: 2, emoji: '🪵' }, { item: 'batu', qty: 3, emoji: '🪨' }],
        desc   : 'Pedang kayu & batu, untuk pemula',
        minLv  : 1,
        upgrade: true, // bisa di-craft ulang untuk upgrade level
    },
    {
        id     : 'sword_iron',
        name   : 'Iron Sword',
        emoji  : '⚔️✨',
        result : { item: 'sword', qty: 1 },
        mat    : [{ item: 'iron', qty: 4, emoji: '⚙️' }, { item: 'batu', qty: 2, emoji: '🪨' }],
        desc   : 'Pedang besi, lebih kuat',
        minLv  : 10,
        upgrade: true,
    },
    {
        id     : 'sword_emerald',
        name   : 'Emerald Sword',
        emoji  : '💚⚔️',
        result : { item: 'sword', qty: 1 },
        mat    : [{ item: 'emerald', qty: 3, emoji: '💚' }, { item: 'iron', qty: 4, emoji: '⚙️' }],
        desc   : 'Pedang emerald, damage tinggi',
        minLv  : 25,
        upgrade: true,
    },

    // ── Armor ────────────────────────────────────────────────────
    {
        id     : 'armor_basic',
        name   : 'Basic Armor',
        emoji  : '🛡️',
        result : { item: 'armor', qty: 1 },
        mat    : [{ item: 'kayu', qty: 3, emoji: '🪵' }, { item: 'iron', qty: 3, emoji: '⚙️' }],
        desc   : 'Baju besi dasar',
        minLv  : 1,
        upgrade: true,
    },
    {
        id     : 'armor_emerald',
        name   : 'Emerald Armor',
        emoji  : '🛡️💚',
        result : { item: 'armor', qty: 1 },
        mat    : [{ item: 'emerald', qty: 4, emoji: '💚' }, { item: 'iron', qty: 5, emoji: '⚙️' }],
        desc   : 'Armor emerald, defense & HP tinggi',
        minLv  : 20,
        upgrade: true,
    },

    // ── Ring ─────────────────────────────────────────────────────
    {
        id     : 'ring_basic',
        name   : 'Silver Ring',
        emoji  : '💍',
        result : { item: 'ring', qty: 1 },
        mat    : [{ item: 'iron', qty: 3, emoji: '⚙️' }, { item: 'batu', qty: 2, emoji: '🪨' }],
        desc   : 'Cincin perak, nambah HP',
        minLv  : 5,
        upgrade: true,
    },
    {
        id     : 'ring_legendary',
        name   : 'Diamond Ring',
        emoji  : '💎💍',
        result : { item: 'ring', qty: 1 },
        mat    : [{ item: 'diamond', qty: 2, emoji: '💎' }, { item: 'gold', qty: 3, emoji: '👑' }],
        desc   : 'Cincin diamond langka, HP +++ ',
        minLv  : 35,
        upgrade: true,
    },

    // ── Gear Langka ───────────────────────────────────────────────
    {
        id     : 'legendary_gear',
        name   : 'Legendary Gear Set',
        emoji  : '🌟⚔️🛡️',
        result : { item: 'legendary', qty: 1 },
        mat    : [
            { item: 'diamond', qty: 3, emoji: '💎' },
            { item: 'gold',    qty: 5, emoji: '👑' },
            { item: 'emerald', qty: 4, emoji: '💚' },
        ],
        desc   : 'Legendary Crate — isi peralatan terbaik',
        minLv  : 50,
        upgrade: false,
    },

    // ── Potion ───────────────────────────────────────────────────
    {
        id     : 'potion',
        name   : 'Potion',
        emoji  : '🧪',
        result : { item: 'potion', qty: 3 },
        mat    : [{ item: 'kayu', qty: 2, emoji: '🪵' }, { item: 'batu', qty: 1, emoji: '🪨' }],
        desc   : 'Ramuan penyembuh, craft 3 sekaligus',
        minLv  : 1,
        upgrade: false,
    },
]

function fmt(n) { return Number(n || 0).toLocaleString('id-ID') }

// ════════════════════════════════════════════════════════════════
let handler = async (m, { args, usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    const lv  = user.level || 1
    const sub = args.join(' ').toLowerCase().trim()

    // ── DAFTAR RESEP ──────────────────────────────────────────────
    if (!sub || sub === 'list' || sub === 'resep') {
        const available = RECIPES.filter(r => lv >= r.minLv)
        const locked    = RECIPES.filter(r => lv < r.minLv)

        const avLines = available.map(r => {
            const mats = r.mat.map(x => `${x.emoji}${x.qty}`).join(' + ')
            return `│  ${r.emoji} *${r.name}* — ${mats}\n│     └ ${r.desc}`
        }).join('\n')

        const lockLines = locked.map(r =>
            `│  🔒 ${r.name} (Level ${r.minLv})`
        ).join('\n')

        return m.reply(`
╭─「 🔨 *CRAFTING* 」
│  Level kamu: ${lv}
│
│  ── ✅ Tersedia ──
${avLines || '│  (Belum ada)'}
│
│  ── 🔒 Terkunci ──
${lockLines || '│  (Semua sudah terbuka)'}
│
│  💡 *.craft <nama>* untuk membuat
│  Contoh: *.craft sword basic*
╰─────────────────────────────`.trim())
    }

    // ── CRAFT ─────────────────────────────────────────────────────
    // Cari resep dari input user (fuzzy match nama)
    const recipe = RECIPES.find(r =>
        r.id.replace(/_/g, ' ').includes(sub) ||
        r.name.toLowerCase().includes(sub) ||
        sub.includes(r.id.replace(/_/g, ' ')) ||
        sub.split(' ').every(w => r.name.toLowerCase().includes(w) || r.id.includes(w))
    )

    if (!recipe) return m.reply(`❌ Resep *${sub}* tidak ditemukan!\nKetik *.crafting* untuk lihat daftar resep.`)

    if (lv < recipe.minLv) return m.reply(`❌ Level kamu (${lv}) belum cukup!\nResep ini butuh *Level ${recipe.minLv}*.`)

    // Cek bahan
    const missingMats = []
    for (const mat of recipe.mat) {
        const have = user[mat.item] || 0
        if (have < mat.qty) missingMats.push(`${mat.emoji} ${mat.item}: butuh ${mat.qty}, punya ${have}`)
    }
    if (missingMats.length) {
        return m.reply(`❌ Bahan kurang!\n\n${missingMats.join('\n')}`)
    }

    // Kurangi bahan
    for (const mat of recipe.mat) {
        user[mat.item] -= mat.qty
    }

    // Beri hasil
    const resultItem = recipe.result.item
    const oldLevel   = user[resultItem] || 0

    if (recipe.upgrade && oldLevel > 0) {
        // Upgrade level item yang sudah ada
        user[resultItem] = oldLevel + 1
    } else {
        user[resultItem] = (user[resultItem] || 0) + recipe.result.qty
    }

    await global.db.write()

    const matsUsed = recipe.mat.map(x => `${x.emoji} ${x.item} x${x.qty}`).join('\n│  ')
    const upgraded = recipe.upgrade && oldLevel > 0
        ? `\n│  ⬆️ Upgrade: Lv.${oldLevel} → Lv.${user[resultItem]}`
        : `\n│  +${recipe.result.qty} ${recipe.emoji} ${recipe.name}`

    return m.reply(`
╭─「 🔨 *CRAFTING BERHASIL!* 」
│
│  🎯 Resep  : ${recipe.emoji} ${recipe.name}
│
│  ── Bahan Digunakan ──
│  ${matsUsed}
│
│  ── Hasil ──${upgraded}
│
│  💡 Ketik *.equip ${resultItem}* untuk pakai!
╰─────────────────────────────`.trim())
}

handler.help     = ['crafting', 'craft']
handler.tags     = ['rpg']
handler.command  = /^(crafting|craft)$/i
handler.register = true
handler.exp      = 5
handler.limit    = false

module.exports = handler

const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/gacha.js — Sistem Gacha Hero RPG
// Command: .gacha | .gacha spin | .gacha pity | .gacha heroes

const SPIN_COST    = 500000
const PITY_MAX     = 10  // setelah 10x spin tanpa legendary, guaranteed legendary

// ═══════════════════════════════════════════════════════════════
// POOL HERO
// ═══════════════════════════════════════════════════════════════
const HEROES = {
    common: [
        { id: 'archer',    name: 'Archer',       emoji: '🏹', atk: 8,  def: 3,  hp: 15 },
        { id: 'knight',    name: 'Knight',        emoji: '⚔️', atk: 6,  def: 8,  hp: 20 },
        { id: 'healer',    name: 'Healer',        emoji: '💊', atk: 3,  def: 5,  hp: 25 },
        { id: 'rogue',     name: 'Rogue',         emoji: '🗡️', atk: 10, def: 2,  hp: 12 },
        { id: 'farmer',    name: 'Farmer Hero',   emoji: '🌾', atk: 4,  def: 4,  hp: 18 },
    ],
    rare: [
        { id: 'mage',      name: 'Fire Mage',     emoji: '🔥', atk: 18, def: 5,  hp: 20 },
        { id: 'paladin',   name: 'Paladin',       emoji: '🛡️', atk: 10, def: 18, hp: 30 },
        { id: 'assassin',  name: 'Assassin',      emoji: '🥷', atk: 22, def: 4,  hp: 15 },
        { id: 'ranger',    name: 'Dark Ranger',   emoji: '🌑🏹',atk: 16, def: 8,  hp: 22 },
        { id: 'shaman',    name: 'Thunder Shaman',emoji: '⚡', atk: 14, def: 10, hp: 25 },
    ],
    legendary: [
        { id: 'dragon_sl', name: 'Dragon Slayer', emoji: '🐉⚔️', atk: 40, def: 20, hp: 60, bonus: 'Damage Naga +50%' },
        { id: 'arch_mage', name: 'Archmage',      emoji: '🌟🔮', atk: 45, def: 15, hp: 50, bonus: 'EXP +25% dari dungeon' },
        { id: 'shadow_ki', name: 'Shadow King',   emoji: '👑💀', atk: 38, def: 25, hp: 55, bonus: 'Crit chance +20%' },
        { id: 'holy_pala', name: 'Holy Paladin',  emoji: '✨🛡️', atk: 25, def: 40, hp: 80, bonus: 'HP regen +10/jam' },
        { id: 'time_sage', name: 'Time Sage',     emoji: '⌛🧙', atk: 35, def: 18, hp: 45, bonus: 'Cooldown semua -15%' },
    ],
}

const RARITY_CONFIG = {
    common    : { label: '😐 Common',    chance: 0.60, color: '⬜', stars: '⭐' },
    rare      : { label: '😏 Rare',      chance: 0.30, color: '🟦', stars: '⭐⭐⭐' },
    legendary : { label: '🔥 Legendary', chance: 0.10, color: '🟨', stars: '⭐⭐⭐⭐⭐' },
}

function randItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
}

function rollRarity(pityCount) {
    // Pity system: setelah PITY_MAX spin tanpa legendary → guaranteed
    if (pityCount >= PITY_MAX) return 'legendary'
    const r = Math.random()
    if (r < 0.10) return 'legendary'
    if (r < 0.40) return 'rare'
    return 'common'
}

function fmt(n) { return Number(n || 0).toLocaleString('id-ID') }

// ════════════════════════════════════════════════════════════════
let handler = async (m, { args, usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    // Inisialisasi koleksi hero & pity
    if (!user.heroes)     user.heroes = []
    if (!user.gachaPity)  user.gachaPity = 0

    const sub = (args[0] || '').toLowerCase()

    // ── KOLEKSI HERO ──────────────────────────────────────────────
    if (sub === 'heroes' || sub === 'hero' || sub === 'koleksi') {
        if (!user.heroes.length) return m.reply('📭 Kamu belum punya hero! Ketik *.gacha spin* untuk mulai.')

        // Group by rarity
        const byRarity = { legendary: [], rare: [], common: [] }
        for (const h of user.heroes) {
            const pool = Object.values(HEROES).flat().find(x => x.id === h.id)
            if (pool) byRarity[h.rarity]?.push({ ...pool, count: h.count || 1 })
        }

        const lines = []
        for (const [rar, list] of Object.entries(byRarity)) {
            if (!list.length) continue
            const cfg = RARITY_CONFIG[rar]
            lines.push(`│  ${cfg.color} *${cfg.label}*`)
            for (const h of list) {
                lines.push(`│    ${h.emoji} ${h.name}${h.count > 1 ? ` x${h.count}` : ''} — ATK:${h.atk} DEF:${h.def} HP:+${h.hp}${h.bonus ? `\n│       💡 ${h.bonus}` : ''}`)
            }
        }

        return m.reply(`
╭─「 📖 *KOLEKSI HERO* 」
│  👤 *${user.name || 'Hero'}*  |  Total: ${user.heroes.reduce((s, h) => s + (h.count || 1), 0)} hero
│
${lines.join('\n')}
│
│  🎯 Pity : ${user.gachaPity}/${PITY_MAX} (${PITY_MAX - user.gachaPity} spin lagi → guaranteed Legendary)
╰─────────────────────────────`.trim())
    }

    // ── PITY INFO ─────────────────────────────────────────────────
    if (sub === 'pity' || sub === 'info') {
        return m.reply(`
🎰 *Info Gacha*

💰 Biaya   : ${SPIN_COST.toLocaleString('id-ID')} koin / spin
📊 Rate    :
  😐 Common    : 60%
  😏 Rare      : 30%
  🔥 Legendary : 10%

🛡️ Pity System:
  Setiap ${PITY_MAX}x spin tanpa Legendary → dijamin dapat Legendary!
  Pity kamu sekarang: *${user.gachaPity}/${PITY_MAX}*
  (${PITY_MAX - user.gachaPity} spin lagi)

💵 Koin kamu: ${fmt(user.money)}`)
    }

    // ── SPIN ──────────────────────────────────────────────────────
    if (sub === 'spin' || sub === 'pull' || sub === '') {
        // Cek koin
        if ((user.money || 0) < SPIN_COST) {
            return m.reply(`❌ Koin kurang! Butuh *${fmt(SPIN_COST)}* koin.\n💰 Koin kamu: ${fmt(user.money)}`)
        }

        user.money     -= SPIN_COST
        user.gachaPity  = (user.gachaPity || 0) + 1

        const rarity = rollRarity(user.gachaPity)
        const pool   = HEROES[rarity]
        const hero   = randItem(pool)
        const cfg    = RARITY_CONFIG[rarity]

        // Simpan ke koleksi
        const existing = user.heroes.find(h => h.id === hero.id)
        if (existing) {
            existing.count = (existing.count || 1) + 1
        } else {
            user.heroes.push({ id: hero.id, rarity, count: 1 })
        }

        // Reset pity kalau dapat legendary
        if (rarity === 'legendary') {
            user.gachaPity = 0
        }

        await global.db.write()

        const isPity = rarity === 'legendary' && (user.gachaPity === 0)
        const pityTag = isPity ? '\n│  🛡️ *[PITY TRIGGERED!]*' : ''
        const dupTag  = existing ? `\n│  🔁 Duplikat! Total: x${existing.count}` : '\n│  ✨ Hero baru!'

        const bonusLine = hero.bonus ? `\n│  💡 *Bonus:* ${hero.bonus}` : ''

        return m.reply(`
╭─「 🎰 *GACHA RPG* 」${pityTag}
│
│  ${cfg.color} *${cfg.label}*  ${cfg.stars}
│
│  ${hero.emoji}  *${hero.name}*${dupTag}
│
│  📊 *Stat Hero:*
│  ⚔️ ATK : +${hero.atk}
│  🛡️ DEF : +${hero.def}
│  ❤️ HP  : +${hero.hp}${bonusLine}
│
│  💰 Sisa koin : ${fmt(user.money)}
│  🎯 Pity      : ${user.gachaPity}/${PITY_MAX}
│
│  💡 *.gacha spin* untuk putar lagi
│  💡 *.gacha heroes* untuk lihat koleksi
╰─────────────────────────────`.trim())
    }

    return m.reply(`🎰 *Gacha RPG*\n\n*.gacha spin* — spin hero (${fmt(SPIN_COST)} koin)\n*.gacha heroes* — lihat koleksi\n*.gacha pity* — info & rate`)
}

handler.help     = ['gacha']
handler.tags     = ['rpg']
handler.command  = /^gacha$/i
handler.register = true
handler.exp      = 3
handler.limit    = false

module.exports = handler

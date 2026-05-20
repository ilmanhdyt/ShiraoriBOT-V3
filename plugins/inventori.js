// plugins/inventori.js — Inventori Terpadu ShiraoriBOT
// ════════════════════════════════════════════════════════
//  Menampilkan SEMUA item dari semua fitur (RPG, Mafia,
//  Pet, Gacha, Equipment) dalam satu tampilan.
//  Money / Bank TIDAK ditampilkan di sini (ada di .dompet)
// ════════════════════════════════════════════════════════

const findUser = require('../lib/findUser')
const { resolveTargetUser } = require('../lib/resolveTarget')
const path     = require('path')
const fs       = require('fs')

const MAFIA_DB_PATH = path.join(__dirname, '../database/mafia_empire.json')

function loadMafiaDB() {
    try {
        if (fs.existsSync(MAFIA_DB_PATH))
            return JSON.parse(fs.readFileSync(MAFIA_DB_PATH, 'utf-8'))
    } catch (_) {}
    return { players: {}, alliances: {} }
}

const bar = (v, max, len = 8) => {
    const filled = Math.round((Math.min(v, max) / Math.max(max, 1)) * len)
    return '█'.repeat(filled) + '░'.repeat(len - filled)
}
const fmt = n => Number(n || 0).toLocaleString('id-ID')

let handler = async (m, { conn, args = [], participants = [] }) => {
    const target = resolveTargetUser({ m, args, conn, participants, candidate: args[0] })
    const rawWho = target?.jid || m.sender
    const result  = findUser(rawWho, participants, conn)
    if (!result) return m.reply('❌ Data user tidak ditemukan!')
    const { user, jid: resolvedKey } = result
    const name = user.name || conn.getName?.(rawWho) || 'Unknown'

    // ─────────────────────────────────────────────────────────────
    // 1. SUMBER DAYA (RPG + Mafia terintegrasi)
    // ─────────────────────────────────────────────────────────────
    const resources = [
        ['👑 Gold',     user.gold    || 0],
        ['🪵 Kayu',     user.kayu    || 0],
        ['🪨 Batu',     user.batu    || 0],
        ['⚙️ Besi',     user.iron    || 0],
        ['💚 Emerald',  user.emerald || 0],
        ['💎 Diamond',  user.diamond || 0],
        ['🍖 Makanan',  user.food    || 0],   // dipakai mafia & pet
        ['🗑️ Sampah',   user.sampah  || 0],
    ].filter(([, v]) => v > 0)

    // ─────────────────────────────────────────────────────────────
    // 2. KONSUMABEL
    // ─────────────────────────────────────────────────────────────
    const consumables = [
        ['🥤 Potion',   user.potion  || 0],
        ['🍗 Pet Food', user.petFood || 0],
    ].filter(([, v]) => v > 0)

    // ─────────────────────────────────────────────────────────────
    // 3. EQUIPMENT
    // ─────────────────────────────────────────────────────────────
    const equip = []
    if ((user.sword      || 0) > 0) equip.push(`⚔️ Pedang Lv.${user.sword} — durasi: ${user.sworddurability || 0}`)
    if ((user.armor      || 0) > 0) equip.push(`🛡️ Zirah Lv.${user.armor} — durasi: ${user.armordurability || 0}`)
    if ((user.pickaxe    || 0) > 0) equip.push(`⛏️ Kapak Lv.${user.pickaxe} — durasi: ${user.pickaxedurability || 0}`)
    if ((user.fishingrod || 0) > 0) equip.push(`🎣 Kail Lv.${user.fishingrod} — durasi: ${user.fishingroddurability || 0}`)

    // ─────────────────────────────────────────────────────────────
    // 4. PET AKTIF (sistem baru pet-system.js)
    // ─────────────────────────────────────────────────────────────
    let petLines = []
    if (user.pet && typeof user.pet === 'object' && user.pet.name) {
        const p = user.pet
        const MAX_HUNGER = 100
        petLines = [
            `${p.emoji || '🐾'} *${p.name}* (Lv.${p.level || 1}) — ${p.rarity || ''}`,
            `│     ❤️ HP: ${bar(p.hp, p.maxHp || p.hp)} ${p.hp}/${p.maxHp || p.hp}`,
            `│     🍖 Lapar: ${bar(p.hunger, MAX_HUNGER)} ${p.hunger}/${MAX_HUNGER}`,
            `│     ⚔️ ATK ${p.atk} | 🛡️ DEF ${p.def}${p.skill ? ` | ✨ ${p.skill.name}` : ''}`,
        ]
    }

    // ─────────────────────────────────────────────────────────────
    // 5. AYAM TARUNG
    // ─────────────────────────────────────────────────────────────
    let chickenLines = []
    if (user.chicken && user.chicken.name) {
        const ch = user.chicken
        chickenLines = [
            `🐓 *${ch.name}* — Lv.${ch.level || 1}`,
            `│     ❤️ ${ch.hp} HP | ⚔️ ATK ${ch.atk} | 🛡️ DEF ${ch.def} | ⚡ SPD ${ch.spd}`,
            `│     🏆 ${ch.win || 0}W / ${ch.lose || 0}L`,
        ]
    }

    // ─────────────────────────────────────────────────────────────
    // 6. HEROES (Gacha)
    // ─────────────────────────────────────────────────────────────
    const heroLines = []
    if (Array.isArray(user.heroes) && user.heroes.length > 0) {
        for (const h of user.heroes.slice(0, 6)) {
            heroLines.push(`│  🎖️ ${h.id} — ${h.rarity} ×${h.count || 1}`)
        }
        if (user.heroes.length > 6)
            heroLines.push(`│  ... +${user.heroes.length - 6} hero lainnya`)
    }

    // ─────────────────────────────────────────────────────────────
    // 7. MAFIA EMPIRE (bangunan & pasukan saja, resource = sumber daya di atas)
    // ─────────────────────────────────────────────────────────────
    const mafiaLines = []
    if (m.isGroup) {
        try {
            const mafiaDB = loadMafiaDB()
            const mp = mafiaDB.players?.[m.chat]?.[resolvedKey]
            if (mp) {
                const b = mp.buildings || {}
                const t = mp.troops || {}
                const bStr = Object.entries(b)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => `${k} Lv.${v}`)
                    .join(' | ') || 'Belum ada'
                const tStr = `🗡️${t.soldier||0} 🏹${t.archer||0} 🐴${t.knight||0}`
                mafiaLines.push(`🏙️ *${mp.name || name}*`)
                mafiaLines.push(`│  🏛️ Bangunan: ${bStr}`)
                mafiaLines.push(`│  ⚔️ Pasukan: ${tStr}`)
                if (mp.alliance) mafiaLines.push(`│  🤝 Aliansi: ${mp.alliance}`)
            }
        } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────────
    // 8. CRATE & LAIN-LAIN
    // ─────────────────────────────────────────────────────────────
    const crates = [
        ['🗃️ Legendary Crate', user.legendary || 0],
        ['🗳️ Mythic Crate',    user.mythic    || 0],
        ['🎁 Uncommon Crate',  user.uncommon  || 0],
        ['📦 Common Crate',    user.common    || 0],
    ].filter(([, v]) => v > 0)

    // ─────────────────────────────────────────────────────────────
    // BUILD OUTPUT
    // ─────────────────────────────────────────────────────────────
    const sections = []

    if (resources.length) {
        sections.push(
            `├─「 ⛏️ *SUMBER DAYA* 」\n` +
            resources.map(([l, v]) => `│  ${l}: *${fmt(v)}*`).join('\n')
        )
    }

    if (consumables.length) {
        sections.push(
            `├─「 🧪 *KONSUMABEL* 」\n` +
            consumables.map(([l, v]) => `│  ${l}: *${v}*`).join('\n')
        )
    }

    if (equip.length) {
        sections.push(
            `├─「 ⚔️ *EQUIPMENT* 」\n` +
            equip.map(e => `│  ${e}`).join('\n')
        )
    }

    if (petLines.length) {
        sections.push(`├─「 🐾 *PET AKTIF* 」\n│  ` + petLines.join('\n│  '))
    }

    if (chickenLines.length) {
        sections.push(`├─「 🐓 *AYAM TARUNG* 」\n│  ` + chickenLines.join('\n│  '))
    }

    if (heroLines.length) {
        sections.push(`├─「 🎖️ *HEROES* (${user.heroes.length}) 」\n` + heroLines.join('\n'))
    }

    if (mafiaLines.length) {
        sections.push(`├─「 🏰 *MAFIA EMPIRE* 」\n│  ` + mafiaLines.join('\n│  '))
    }

    if (crates.length) {
        sections.push(
            `├─「 🎁 *CRATE* 」\n` +
            crates.map(([l, v]) => `│  ${l}: *${v}*`).join('\n')
        )
    }

    const gachaPity = user.gachaPity || 0
    if (gachaPity > 0) {
        sections.push(`├─「 🎰 *GACHA* 」\n│  🍀 Pity: ${gachaPity}/100`)
    }

    const body = sections.length
        ? sections.join('\n│\n')
        : '│  _Inventori kosong_'

    return m.reply(`
╭─「 🎒 *INVENTORI — ${name}* 」
│
${body}
│
│  💡 Sumber daya Mafia Empire & RPG bersatu!
│  Gunakan *.dompet* untuk lihat uang & bank.
╰─────────────────
`.trim())
}

handler.help     = ['inventori', 'inv', 'inventory']
handler.tags     = ['rpg']
handler.command  = /^(inventori|inv|inventory)$/i
handler.register = true
handler.exp      = 0

module.exports = handler

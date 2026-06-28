const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/dungeon.js — Sistem Dungeon RPG
// Command: .dungeon | .dungeon status | .dungeon heal

const COOLDOWN = 60 * 60 * 1000 // 1 jam

const ENEMIES = [
    { name: 'Goblin',      emoji: '👺', hp: 40,  atk: 8,  def: 2,  exp: 20,  money: [100, 300]  },
    { name: 'Serigala',    emoji: '🐺', hp: 55,  atk: 12, def: 3,  exp: 30,  money: [150, 400]  },
    { name: 'Zombie',      emoji: '🧟', hp: 70,  atk: 10, def: 5,  exp: 35,  money: [200, 450]  },
    { name: 'Orc',         emoji: '👹', hp: 90,  atk: 15, def: 7,  exp: 50,  money: [300, 600]  },
    { name: 'Dark Elf',    emoji: '🧝', hp: 80,  atk: 18, def: 6,  exp: 55,  money: [350, 700]  },
    { name: 'Stone Golem', emoji: '🗿', hp: 130, atk: 14, def: 12, exp: 70,  money: [400, 800]  },
    { name: 'Vampire',     emoji: '🧛', hp: 100, atk: 22, def: 8,  exp: 80,  money: [500, 1000] },
]

const BOSSES = [
    { name: 'Dragon Merah',  emoji: '🔴🐉', hp: 300, atk: 40, def: 15, exp: 300, money: [2000, 5000], loot: 'legendary' },
    { name: 'Shadow Demon',  emoji: '👿',   hp: 250, atk: 45, def: 10, exp: 280, money: [1800, 4500], loot: 'diamond'   },
    { name: 'Lich King',     emoji: '💀👑', hp: 280, atk: 38, def: 18, exp: 320, money: [2200, 5500], loot: 'gold'      },
]

const LOOT_TABLE = [
    { item: 'kayu',     emoji: '🪵', label: 'Kayu',     chance: 0.35, min: 1, max: 3  },
    { item: 'batu',     emoji: '🪨', label: 'Batu',     chance: 0.30, min: 1, max: 3  },
    { item: 'iron',     emoji: '⚙️', label: 'Besi',     chance: 0.20, min: 1, max: 2  },
    { item: 'emerald',  emoji: '💚', label: 'Emerald',  chance: 0.10, min: 1, max: 1  },
    { item: 'diamond',  emoji: '💎', label: 'Diamond',  chance: 0.05, min: 1, max: 1  },
    { item: 'potion',   emoji: '🧪', label: 'Potion',   chance: 0.25, min: 1, max: 2  },
]

const HEAL_COST = 500

// ── Helper stat user ─────────────────────────────────────────────
function getStats(user) {
    const lv   = user.level  || 1
    const sw   = user.equippedSword  || 0
    const ar   = user.equippedArmor  || 0
    const rng  = user.equippedRing   || 0

    const maxHp  = 100 + (lv * 10) + (ar * 8) + (rng * 5)
    const attack  = 10  + (lv * 2)  + (sw * 5)
    const defense = 5   + (lv * 1)  + (ar * 3)

    // Init HP kalau belum pernah masuk dungeon
    if (!user.hp || user.hp > maxHp) user.hp = maxHp

    return { maxHp, attack, defense }
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function simulateBattle(playerAtk, playerDef, playerHp, enemy) {
    let pHp  = playerHp
    let eHp  = enemy.hp
    const log = []
    let round = 0

    while (pHp > 0 && eHp > 0 && round < 20) {
        round++
        const pDmg = Math.max(1, playerAtk - enemy.def + randInt(-2, 3))
        const eDmg = Math.max(1, enemy.atk  - playerDef + randInt(-2, 2))
        eHp -= pDmg
        pHp -= eDmg
        if (round <= 3) log.push(`Ronde ${round}: Kamu -${pDmg}⚔️ | Musuh -${eDmg}💥`)
    }

    return { win: eHp <= 0, remainHp: Math.max(0, pHp), log }
}

// ════════════════════════════════════════════════════════════════
let handler = async (m, { conn, args, usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    const sub = (args[0] || '').toLowerCase()
    const { maxHp, attack, defense } = getStats(user)

    // ── STATUS ───────────────────────────────────────────────────
    if (sub === 'status' || sub === 'stat') {
        return m.reply(`
╭─「 ⚔️ *DUNGEON STATUS* 」
│
│  👤 *${user.name || 'Hero'}*  Lv.${user.level || 1}
│
│  ❤️ HP     : ${user.hp} / ${maxHp}
│  ⚔️ Attack : ${attack}
│  🛡️ Defense: ${defense}
│
│  🗡️ Sword  : ${user.equippedSword  ? `Lv.${user.equippedSword}`  : '❌ Kosong'}
│  🛡️ Armor  : ${user.equippedArmor  ? `Lv.${user.equippedArmor}`  : '❌ Kosong'}
│  💍 Ring   : ${user.equippedRing   ? `Lv.${user.equippedRing}`   : '❌ Kosong'}
│
│  💡 Ketik *.equip* untuk pasang equipment
╰─────────────────────────────────`.trim())
    }

    // ── HEAL ─────────────────────────────────────────────────────
    if (sub === 'heal') {
        if (user.hp >= maxHp) return m.reply(`❤️ HP kamu sudah penuh! (${user.hp}/${maxHp})`)
        if ((user.money || 0) < HEAL_COST) return m.reply(`❌ Butuh 💰 ${HEAL_COST.toLocaleString('id-ID')} rupiah untuk heal!`)
        user.money -= HEAL_COST
        user.hp = maxHp
        await global.db.write()
        return m.reply(`✅ HP dipulihkan penuh! ❤️ ${maxHp}/${maxHp}\n💰 Biaya: -${HEAL_COST.toLocaleString('id-ID')} rupiah`)
    }

    // ── MASUK DUNGEON ─────────────────────────────────────────────
    const now      = Date.now()
    const lastDng  = user.lastDungeon || 0
    const sisaMs   = (lastDng + COOLDOWN) - now

    if (sisaMs > 0) {
        const jam = Math.floor(sisaMs / 3600000)
        const mnt = Math.floor((sisaMs % 3600000) / 60000)
        throw `⏳ Kamu masih kelelahan setelah dungeon terakhir!\nCoba lagi dalam *${jam}j ${mnt}m*`
    }

    if (user.hp <= 0) {
        return m.reply(`💀 HP kamu 0! Ketik *.dungeon heal* (biaya ${HEAL_COST.toLocaleString('id-ID')} rupiah) untuk pulih dulu.`)
    }

    // Tentukan boss atau musuh biasa
    const isBoss = Math.random() < 0.12
    const enemy  = isBoss
        ? BOSSES[randInt(0, BOSSES.length - 1)]
        : ENEMIES[randInt(0, ENEMIES.length - 1)]

    const battle = simulateBattle(attack, defense, user.hp, enemy)

    user.lastDungeon = now

    // ── KALAH ────────────────────────────────────────────────────
    if (!battle.win) {
        const loserupiah  = Math.floor((user.money || 0) * 0.05)
        user.money      = Math.max(0, (user.money || 0) - loserupiah)
        user.hp         = Math.max(1, Math.floor(maxHp * 0.15))
        await global.db.write()

        return m.reply(`
╭─「 💀 *DUNGEON — KEKALAHAN* 」
│
│  ${enemy.emoji} *${enemy.name}* terlalu kuat!
│
│  ${battle.log.join('\n│  ')}
│
│  ❤️ HP tersisa : 1 (kritis!)
│  💰 Kehilangan : -${loserupiah.toLocaleString('id-ID')} rupiah (5%)
│
│  🏥 Ketik *.dungeon heal* untuk pulih
╰─────────────────────────────`.trim())
    }

    // ── MENANG ────────────────────────────────────────────────────
    const moneyGain = randInt(enemy.money[0], enemy.money[1])
    const expGain   = enemy.exp + (isBoss ? 0 : randInt(-5, 10))

    user.money  = (user.money  || 0) + moneyGain
    user.exp    = (user.exp    || 0) + expGain
    user.hp     = Math.max(1, battle.remainHp)

    // Loot
    const lootLines = []
    if (isBoss && enemy.loot) {
        user[enemy.loot] = (user[enemy.loot] || 0) + 1
        lootLines.push(`🎁 *Loot Boss:* +1 ${enemy.loot}`)
    } else {
        for (const l of LOOT_TABLE) {
            if (Math.random() < l.chance) {
                const qty = randInt(l.min, l.max)
                user[l.item] = (user[l.item] || 0) + qty
                lootLines.push(`${l.emoji} ${l.label} x${qty}`)
                if (lootLines.length >= 3) break
            }
        }
    }

    await global.db.write()

    const lootText = lootLines.length
        ? `│\n│  🎁 *Loot:*\n│  ${lootLines.join('\n│  ')}`
        : ''

    const bossTag = isBoss ? '\n│  🐉 *[BOSS BATTLE!]*' : ''

    return m.reply(`
╭─「 ⚔️ *DUNGEON — MENANG!* 」
│${bossTag}
│  ${enemy.emoji} *${enemy.name}* dikalahkan!
│
│  ${battle.log.join('\n│  ')}
│
│  ❤️ HP tersisa : ${user.hp} / ${maxHp}
│  ⭐ EXP       : +${expGain}
│  💰 rupiah      : +${moneyGain.toLocaleString('id-ID')}${lootText}
│
│  🏦 Total rupiah: ${(user.money).toLocaleString('id-ID')}
╰─────────────────────────────`.trim())
}

handler.help     = ['dungeon']
handler.tags     = ['rpg']
handler.command  = /^dungeon$/i
handler.register = true
handler.exp      = 0
handler.limit    = false

module.exports = handler

const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/adventure.js — Petualangan Random Event RPG
// Command: .adventure | .adv

const COOLDOWN = 45 * 60 * 1000 // 45 menit

// ── TIPE EVENT ───────────────────────────────────────────────────
const EVENTS = [

    // 💰 Nemu harta
    {
        type: 'treasure', weight: 25,
        execute(user) {
            const money = randInt(50000, 150000)
            const exp   = randInt(10, 30)
            user.money  = (user.money || 0) + money
            user.exp    = (user.exp   || 0) + exp
            const items = []
            if (Math.random() < 0.4) {
                const qty = randInt(1, 3)
                user.kayu = (user.kayu || 0) + qty
                items.push(`🪵 Kayu x${qty}`)
            }
            if (Math.random() < 0.25) {
                const qty = randInt(1, 2)
                user.iron = (user.iron || 0) + qty
                items.push(`⚙️ Besi x${qty}`)
            }
            const lootTxt = items.length ? `\n│  🎒 Item: ${items.join(', ')}` : ''
            return {
                title : '💰 NEMU HARTA KARUN!',
                body  :
`│  Kamu menemukan peti terkubur di bawah pohon tua!
│
│  ⭐ EXP   : +${exp}
│  💰 Uang  : +${money.toLocaleString('id-ID')}${lootTxt} rupiah`,
            }
        }
    },

    // ☠️ Kena jebakan
    {
        type: 'trap', weight: 20,
        execute(user) {
            const lv        = user.level || 1
            const maxHp     = 100 + (lv * 10) + ((user.equippedArmor || 0) * 8)
            if (!user.hp || user.hp > maxHp) user.hp = maxHp

            const dmg     = randInt(10, Math.min(50, Math.floor(user.hp * 0.4)))
            const loseMon = randInt(100, 500)
            user.hp     = Math.max(1, user.hp - dmg)
            user.money  = Math.max(0, (user.money || 0) - loseMon)

            const traps = [
                'Kamu menginjak lubang jebakan yang tersembunyi!',
                'Panah beracun melesat dari semak-semak!',
                'Batu besar menggelinding menimpamu!',
                'Kamu terpeleset ke dalam jurang kecil!',
            ]
            return {
                title: '☠️ KENA JEBAKAN!',
                body :
`│  ${traps[randInt(0, traps.length - 1)]}
│
│  ❤️ HP    : -${dmg} (sisa: ${user.hp})
│  💰 Uang  : -${loseMon.toLocaleString('id-ID')} (jatuh berserakan) rupiah`,
            }
        }
    },

    // 🧓 Ketemu NPC
    {
        type: 'npc', weight: 25,
        execute(user) {
            const npcs = [
                {
                    name: 'Pedagang Misterius',
                    emoji: '🧙',
                    story: 'Seorang pedagang tua memberimu hadiah kecil.',
                    reward: () => {
                        const item = ['kayu','batu','iron'][randInt(0,2)]
                        user[item] = (user[item] || 0) + randInt(2, 5)
                        const names = { kayu:'🪵 Kayu', batu:'🪨 Batu', iron:'⚙️ Besi' }
                        return `🎁 Dapat ${names[item]} dari pedagang!`
                    }
                },
                {
                    name: 'Peri Hutan',
                    emoji: '🧚',
                    story: 'Peri kecil menyembuhkan lukamu.',
                    reward: () => {
                        const lv     = user.level || 1
                        const maxHp  = 100 + (lv * 10) + ((user.equippedArmor || 0) * 8)
                        const heal   = randInt(20, 50)
                        user.hp      = Math.min(maxHp, (user.hp || maxHp) + heal)
                        return `❤️ HP dipulihkan +${heal} (sekarang: ${user.hp})`
                    }
                },
                {
                    name: 'Kakek Bijak',
                    emoji: '👴',
                    story: 'Kakek berbagi pengetahuan rahasia!',
                    reward: () => {
                        const exp  = randInt(30, 80)
                        user.exp   = (user.exp || 0) + exp
                        return `⭐ EXP +${exp} dari ilmu kakek!`
                    }
                },
                {
                    name: 'Bandit Bertobat',
                    emoji: '🥷',
                    story: 'Bandit menyerah dan memberikan hasil rampokannya.',
                    reward: () => {
                        const koin = randInt(400, 1200)
                        user.money = (user.money || 0) + koin
                        return `💰 +${koin.toLocaleString('id-ID')} uang dari bandit!`
                    }
                },
                {
                    name: 'Penambang Tersesat',
                    emoji: '⛏️',
                    story: 'Penambang lupa jalan pulang, kamu menolongnya.',
                    reward: () => {
                        const qty  = randInt(1, 3)
                        user.emerald = (user.emerald || 0) + qty
                        return `💚 +${qty} Emerald sebagai ucapan terima kasih!`
                    }
                },
            ]

            const npc    = npcs[randInt(0, npcs.length - 1)]
            const reward = npc.reward()

            return {
                title: `🧓 KETEMU NPC — ${npc.name}`,
                body :
`│  ${npc.emoji} *${npc.name}*
│  "${npc.story}"
│
│  ${reward}`,
            }
        }
    },

    // 🌟 Event langka — nemu equipment
    {
        type: 'rare_find', weight: 10,
        execute(user) {
            const finds = [
                { item: 'potion', emoji: '🧪', label: 'Potion', qty: randInt(1, 3) },
                { item: 'emerald', emoji: '💚', label: 'Emerald', qty: randInt(1, 2) },
                { item: 'gold', emoji: '👑', label: 'Gold', qty: 1 },
            ]
            const f = finds[randInt(0, finds.length - 1)]
            user[f.item] = (user[f.item] || 0) + f.qty
            const exp = randInt(20, 50)
            user.exp   = (user.exp || 0) + exp
            return {
                title: '🌟 PENEMUAN LANGKA!',
                body :
`│  Kamu menemukan sesuatu berharga tersembunyi!
│
│  ${f.emoji} ${f.label} x${f.qty}
│  ⭐ EXP : +${exp}`,
            }
        }
    },

    // ⚔️ Bentrokan kecil (menang)
    {
        type: 'skirmish', weight: 20,
        execute(user) {
            const lv    = user.level || 1
            const money = randInt(200, 800)
            const exp   = randInt(15, 40)
            const dmg   = randInt(5, 20)
            const maxHp = 100 + (lv * 10) + ((user.equippedArmor || 0) * 8)
            if (!user.hp || user.hp > maxHp) user.hp = maxHp
            user.hp    = Math.max(1, user.hp - dmg)
            user.money = (user.money || 0) + money
            user.exp   = (user.exp   || 0) + exp
            const enemies = ['bandit', 'penyamun', 'tentara bayaran', 'monster kecil']
            return {
                title: '⚔️ BENTROK & MENANG!',
                body :
`│  Kamu bertemu ${enemies[randInt(0, enemies.length-1)]} di jalan!
│  Setelah pertarungan singkat, kamu menang!
│
│  ❤️ HP   : -${dmg} (sisa: ${user.hp})
│  ⭐ EXP  : +${exp}
│  💰 Uang : +${money.toLocaleString('id-ID')} rupiah`,
            }
        }
    },
]

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function pickEvent() {
    const total = EVENTS.reduce((s, e) => s + e.weight, 0)
    let r = randInt(0, total - 1)
    for (const e of EVENTS) {
        r -= e.weight
        if (r < 0) return e
    }
    return EVENTS[0]
}

// ════════════════════════════════════════════════════════════════
let handler = async (m, { usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    const now     = Date.now()
    const lastAdv = user.lastAdventure || 0
    const sisaMs  = (lastAdv + COOLDOWN) - now

    if (sisaMs > 0) {
        const mnt = Math.floor(sisaMs / 60000)
        const dtk = Math.floor((sisaMs % 60000) / 1000)
        throw `⏳ Kamu masih dalam perjalanan pulang!\nCoba lagi dalam *${mnt}m ${dtk}d*`
    }

    user.lastAdventure = now

    const event  = pickEvent()
    const result = event.execute(user)

    await global.db.write()

    return m.reply(`
╭─「 🗺️ *PETUALANGAN* 」
│  👤 *${user.name || 'Hero'}*
│
│  ── *${result.title}* ──
│
${result.body}
│
│  💰 Uang sekarang: ${(user.money || 0).toLocaleString('id-ID')} rupiah
│  ⏰ Petualangan lagi dalam 45 menit
╰─────────────────────────────`.trim())
}

handler.help     = ['adventure', 'adv', 'petualangan']
handler.tags     = ['rpg']
handler.command  = /^(adventure|adv|petualangan)$/i
handler.register = true
handler.exp      = 5
handler.limit    = false

module.exports = handler

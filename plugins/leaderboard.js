// leaderboard.js - Papan peringkat ekonomi & game
// Baileys: atexovi-baileys

const BANK_TAX_RATE = 0.02
const BANK_TAX_MS   = 60 * 60 * 1000

// Hitung berapa bank sekarang setelah pajak — TANPA mutate data asli
function calcBankAfterTax(user) {
    const bank = user.bank || 0
    if (bank <= 0 || !user.lastTax) return bank
    const elapsed = (Date.now() - user.lastTax) / BANK_TAX_MS
    if (elapsed < 0.01) return bank
    const tax = Math.floor(bank * BANK_TAX_RATE * elapsed)
    return Math.max(0, bank - tax)
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const users = global.db.data.users || {}
    if (!users) throw '❌ Database kosong!'

    const type = (args[0] || 'koin').toLowerCase()

    const list = Object.entries(users)
        .filter(([_, u]) => u && u.registered)
        .map(([jid, u]) => {
            const bankReal = calcBankAfterTax(u)  // bank setelah pajak (display only)
            return {
                jid,
                name  : u.name || jid.split('@')[0],
                // Total = dompet + bank (sudah dipotong pajak) + investasi aktif
                money : (u.money || 0) + bankReal + (u.invest || 0),
                bank  : bankReal,
                wallet: u.money  || 0,
                invest: u.invest || 0,
                level : u.level  || 0,
                exp   : u.exp    || 0,
                petRarity: u.pet?.rarity || null,
                petName  : u.pet?.name   || null,
            }
        })

    let sorted, title

    switch (type) {
        case 'level':
        case 'exp':
            sorted = list.sort((a, b) => b.level - a.level || b.exp - a.exp)
            title  = '⭐ TOP LEVEL'
            break

        case 'pet':
            const rarityOrder = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 }
            sorted = list
                .filter(u => u.petRarity)
                .sort((a, b) => (rarityOrder[b.petRarity] || 0) - (rarityOrder[a.petRarity] || 0))
            title  = '🐾 TOP PET'
            break

        case 'koin':
        case 'uang':
        default:
            sorted = list.sort((a, b) => b.money - a.money)
            title  = '💵 TOP TERKAYA'
            break
    }

    const top10 = sorted.slice(0, 10)
    if (!top10.length) throw '❌ Belum ada data!'

    const fmt = n => Number(n).toLocaleString('id-ID')

    const rows = top10.map((u, i) => {
        const rank = i + 1

        if (type === 'level' || type === 'exp') {
            if (rank <= 3) {
                return (
                    `\n${MEDAL[i]} ${rank}. *${u.name}*\n` +
                    `⭐ Level: ${u.level} — EXP: ${fmt(u.exp)}`
                )
            }
            return `${rank}. ${u.name} — Lv.${u.level}`

        } else if (type === 'pet') {
            if (rank <= 3) {
                return (
                    `\n${MEDAL[i]} ${rank}. *${u.name}*\n` +
                    `🐾 ${u.petName} (${u.petRarity})`
                )
            }
            return `${rank}. ${u.name} — ${u.petName || '-'}`

        } else {
            // koin / uang
            if (rank <= 3) {
                const investLine = u.invest > 0 ? `\n📈 Invest: ${fmt(u.invest)}` : ''
                return (
                    `\n${MEDAL[i]} ${rank}. *${u.name}*\n` +
                    `💰 Total: ${fmt(u.money)}\n` +
                    `🏦 Bank: ${fmt(u.bank)}\n` +
                    `👛 Dompet: ${fmt(u.wallet)}` +
                    investLine
                )
            }
            return `${rank}. ${u.name} — 💰 ${fmt(u.money)}`
        }
    })

    const top3Block = rows.slice(0, 3).join('\n')
    const restBlock = rows.slice(3).length
        ? '\n\n' + rows.slice(3).join('\n')
        : ''

    const myIdx = sorted.findIndex(u => u.jid.includes(m.sender.split('@')[0].split(':')[0]))
    const myPos = myIdx !== -1 ? `\n\n📍 Posisi kamu: #${myIdx + 1}` : ''

    m.reply(
        `🏆 *LEADERBOARD ${title}*\n` +
        top3Block +
        restBlock +
        myPos +
        `\n\n_Ketik *${usedPrefix}lb koin/level/pet*_`
    )
}

const MEDAL = ['🥇', '🥈', '🥉']

handler.help     = ['leaderboard [koin/level/pet]', 'lb [koin/level/pet]']
handler.tags     = ['rpg', 'ekonomi']
handler.command  = /^(leaderboard|lb|top|ranking)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.exp      = 2
handler.register = true

module.exports = handler
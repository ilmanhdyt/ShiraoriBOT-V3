const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/judi.js
// 🎰 SISTEM JUDI — Slot, Blackjack, Sabung Ayam
// Fix: no double execution, "all" pakai dompet+bank, wallet cap, bank tax

const { applyBankTax, checkWalletCap, notifyWalletCap } = require('./dompet')

// ── Helper ────────────────────────────────────────────────────────
function parseBet(input, userMoney) {
    if (!input) return null
    const str = String(input).toLowerCase().trim()
    // 'all' ditangani di caller masing-masing — jangan return userMoney di sini
    if (str === 'all' || str === 'semua') return null
    const num = parseInt(str.replace(/[^0-9]/g, ''))
    if (isNaN(num) || num <= 0) return null
    return num
}
const fmt = n => Number(n || 0).toLocaleString('id-ID')

// ── Total kekayaan (dompet + bank) untuk mode 'all' ──────────────
function totalWealth(user) {
    const { ensureBank } = require('../database/bankHelper')
    ensureBank(user)
    return (user.money || 0) + (user.bank || 0)
}

// Kurangi dari dompet dulu, sisanya dari bank
function deductWealth(user, amount) {
    const fromWallet = Math.min(user.money || 0, amount)
    const fromBank   = amount - fromWallet
    user.money = (user.money || 0) - fromWallet
    user.bank  = (user.bank  || 0) - fromBank
}

// Hasil menang masuk ke dompet
function addWealth(user, amount) {
    user.money = (user.money || 0) + amount
}

function ensureUserFields(user) {
    if (!user.money)         user.money = 0
    if (!user.chicken)       user.chicken = null
    if (!user.gamblingStats) user.gamblingStats = { win: 0, lose: 0, totalBet: 0 }
    if (!user.judiCount)     user.judiCount = 0
    if (!user.judiDate)      user.judiDate  = ''
}

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

// ── Wallet cap helper lokal ────────────────────────────────────────
// Cek + kirim notif setelah menang
async function applyCapAndNotify(user, conn, senderJid) {
    const cap = checkWalletCap(user)
    if (cap.triggered) {
        const jid = senderJid.includes('@') ? senderJid : senderJid + '@s.whatsapp.net'
        notifyWalletCap(conn, jid, cap.excess, user.bank).catch(() => {})
    }
}

// ── Cek & update limit judi harian ───────────────────────────────
const JUDI_LIMIT_BASE = 10

function getJudiLimit(user) {
    const today = new Date().toISOString().slice(0, 10)
    if (user.judiDate !== today) return JUDI_LIMIT_BASE
    return JUDI_LIMIT_BASE + (user.judiBonusLimit || 0)
}

function checkJudiLimit(user) {
    const today = new Date().toISOString().slice(0, 10)
    if (user.judiDate !== today) {
        user.judiDate       = today
        user.judiCount      = 0
        user.judiBonusLimit = 0
    }
    const limit = getJudiLimit(user)
    if (user.judiCount >= limit) {
        return {
            ok: false,
            msg:
                `⛔ *Limit judi harian habis!*\n\n` +
                `📊 Sudah main: *${user.judiCount}/${limit}* kali hari ini\n` +
                `🕛 Reset besok pukul 00.00\n` +
                `💡 Beli tambahan: *.buy limitjudi* (2000 koin = +5 limit)\n\n` +
                `_Gunakan .slot all untuk main tanpa limit!_`
        }
    }
    return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════
//  🎰 SLOT MACHINE
// ═══════════════════════════════════════════════════════════════════
const SLOT_ROWS = [
    ['🍍', '🍇', '🍍'],
    ['🍊', '🍌', '🍌'],
    ['🍊', '🍊', '🍍'],
]

const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🍌', '🍍', '⭐', '💎', '7️⃣']
const SLOT_WEIGHTS = [30,   25,   20,   15,   10,   6,    2,    1,    0.5]

function spinSlot() {
    const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0)
    function pick() {
        let r = Math.random() * total
        for (let i = 0; i < SLOT_SYMBOLS.length; i++) {
            r -= SLOT_WEIGHTS[i]
            if (r <= 0) return SLOT_SYMBOLS[i]
        }
        return SLOT_SYMBOLS[0]
    }
    return Array.from({ length: 3 }, () => [pick(), pick(), pick()])
}

function slotResult(grid) {
    const [a, b, c] = grid[1]
    if (a === b && b === c) {
        if (a === '7️⃣') return { mult: 8,   msg: '🎊 *JACKPOT! TRIPLE 7!*',  win: true }
        if (a === '💎')  return { mult: 5,   msg: '💎 *TRIPLE DIAMOND!*',      win: true }
        if (a === '⭐')  return { mult: 3.5, msg: '⭐ *TRIPLE STAR!*',          win: true }
        return             { mult: 2,   msg: '🎉 *TRIPLE MATCH!*',           win: true }
    }
    if (a === b || b === c || a === c)
        return             { mult: 1.2, msg: '✨ *DUA SAMA!*',               win: true }
    return                 { mult: 0,   msg: '😢 Kamu kalah, coba lagi!',   win: false }
}

function gridStr(grid) {
    return grid.map((row, i) =>
        row.join(' | ') + (i === 1 ? ' ←' : '')
    ).join('\n')
}

// ═══════════════════════════════════════════════════════════════════
//  🃏 BLACKJACK
// ═══════════════════════════════════════════════════════════════════
const CARD_VALUES = {
    'A':11,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,
    '8':8,'9':9,'10':10,'J':10,'Q':10,'K':10
}
const CARD_SUITS = ['♠','♥','♦','♣']
const CARD_RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']

function createDeckBJ() {
    const deck = []
    for (const s of CARD_SUITS)
        for (const r of CARD_RANKS)
            deck.push({ rank: r, suit: s })
    return deck.sort(() => Math.random() - 0.5)
}

function handValue(hand) {
    let total = hand.reduce((s, c) => s + CARD_VALUES[c.rank], 0)
    let aces  = hand.filter(c => c.rank === 'A').length
    while (total > 21 && aces > 0) { total -= 10; aces-- }
    return total
}

function cardStr(c) { return `${c.rank}${c.suit}` }
function handStr(hand) { return hand.map(cardStr).join(' ') }

if (!global._bjGames) global._bjGames = {}

// ═══════════════════════════════════════════════════════════════════
//  🐓 SABUNG AYAM
// ═══════════════════════════════════════════════════════════════════
const CHICKEN_NAMES = [
    'Jago Merah','Si Bongkok','Petarung Emas','Cakar Besi',
    'Badai Sayap','Sang Juara','Raja Kandang','Si Kilat',
    'Pendekar Paruh','Ayam Liar'
]

function generateChicken() {
    return {
        name : CHICKEN_NAMES[Math.floor(Math.random() * CHICKEN_NAMES.length)],
        hp   : 80 + Math.floor(Math.random() * 41),
        atk  : 10 + Math.floor(Math.random() * 11),
        def  : 3  + Math.floor(Math.random() * 8),
        spd  : 5  + Math.floor(Math.random() * 11),
        win  : 0, lose: 0, level: 1, exp: 0,
    }
}

function simulateFight(myChicken, enemyChicken) {
    let myHP    = myChicken.hp + myChicken.level * 10
    let enemyHP = enemyChicken.hp + enemyChicken.level * 10
    const log   = []
    let round   = 1

    while (myHP > 0 && enemyHP > 0 && round <= 20) {
        const myFirst = myChicken.spd >= enemyChicken.spd
        function attack(atk, defHP, def) {
            const dmg = Math.max(1, atk.atk + Math.floor(Math.random() * 6) - def.def)
            return { dmg, newHP: Math.max(0, defHP - dmg) }
        }
        if (myFirst) {
            const r1 = attack(myChicken, enemyHP, enemyChicken); enemyHP = r1.newHP
            log.push(`Ronde ${round}: 🐓 serang ${r1.dmg} dmg (musuh HP: ${enemyHP})`)
            if (enemyHP <= 0) break
            const r2 = attack(enemyChicken, myHP, myChicken); myHP = r2.newHP
            log.push(`         Musuh balas ${r2.dmg} dmg (HP kamu: ${myHP})`)
        } else {
            const r1 = attack(enemyChicken, myHP, myChicken); myHP = r1.newHP
            log.push(`Ronde ${round}: Musuh serang ${r1.dmg} dmg (HP kamu: ${myHP})`)
            if (myHP <= 0) break
            const r2 = attack(myChicken, enemyHP, enemyChicken); enemyHP = r2.newHP
            log.push(`         🐓 balas ${r2.dmg} dmg (musuh HP: ${enemyHP})`)
        }
        round++
    }
    return { win: myHP > enemyHP, myHP: Math.max(0, myHP), enemyHP: Math.max(0, enemyHP), log: log.slice(-6) }
}

// ═══════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════
let handler = async (m, { conn, command, args, usedPrefix }) => {
    const cmd  = command.toLowerCase()
    const user = getDbUser(m.sender)
    if (!user) return m.reply('❌ Kamu belum terdaftar! Ketik *.daftar* dulu.')
    ensureUserFields(user)

    // ── CHICKEN STATS ─────────────────────────────────────────────
    if (/^chickenstats$/.test(cmd)) {
        if (!user.chicken) return m.reply(`❌ Belum punya ayam!\nBeli: *.buy chicken* (500 koin)`)
        const c = user.chicken
        return m.reply(
            `╔══════════════════╗\n` +
            `  🐓 *STATS AYAM*\n` +
            `╚══════════════════╝\n\n` +
            `📛 Nama  : *${c.name}*\n` +
            `⭐ Level : ${c.level}\n` +
            `📈 EXP   : ${c.exp}/${c.level * 50}\n\n` +
            `❤️ HP  : ${c.hp}\n` +
            `⚔️ ATK : ${c.atk}\n` +
            `🛡️ DEF : ${c.def}\n` +
            `💨 SPD : ${c.spd}\n\n` +
            `🏆 Menang: ${c.win} | Kalah: ${c.lose}\n\n` +
            `_Tarung: .cockfight <bet>_`
        )
    }

    // ── SLOT MACHINE ──────────────────────────────────────────────
    if (/^slot$/.test(cmd)) {
        const MIN_BET    = 100
        const isSlotAll  = ['all','semua'].includes((args[0]||'').toLowerCase())

        // Terapkan pajak bank sebelum hitung total
        applyBankTax(user)
        const wealth = totalWealth(user)

        const bet = isSlotAll ? wealth : parseBet(args[0], user.money)

        if (!bet) return m.reply(
            `🎰 *SLOTS*\n\n` +
            `Cara pakai:\n` +
            `• *.slot 1000*\n` +
            `• *.slot all* — semua uang (tanpa limit!)\n\n` +
            `Min bet: ${fmt(MIN_BET)} koin\n` +
            `💰 Dompet: ${fmt(user.money)} | Bank: ${fmt(user.bank||0)}\n\n` +
            `📊 Judi hari ini: ${user.judiCount}/${getJudiLimit(user)}`
        )
        if (wealth <= 0) return m.reply('❌ Uangmu habis! Ketik *.daily* dulu.')
        if (bet < MIN_BET)   return m.reply(`❌ Minimal bet: ${fmt(MIN_BET)} koin!`)
        if (bet > wealth)    return m.reply(`❌ Uang tidak cukup! Dompet+Bank: ${fmt(wealth)} koin`)

        if (!isSlotAll) {
            const limitCheck = checkJudiLimit(user)
            if (!limitCheck.ok) return m.reply(limitCheck.msg)
        }

        const grid               = spinSlot()
        const { mult, msg, win } = slotResult(grid)
        const winAmount          = Math.floor(bet * mult)
        const profit             = winAmount - bet

        if (profit > 0) addWealth(user, profit)
        else if (profit < 0) deductWealth(user, Math.abs(profit))

        user.gamblingStats.totalBet += bet
        if (profit > 0) user.gamblingStats.win++
        else            user.gamblingStats.lose++
        if (!isSlotAll) user.judiCount++

        // Cek wallet cap setelah menang
        if (profit > 0) await applyCapAndNotify(user, conn, m.sender)

        await saveDB()

        const sisaLimit = isSlotAll ? 'Mode ALL — tanpa limit' : `${Math.max(0, getJudiLimit(user) - user.judiCount)}x lagi hari ini`

        return m.reply(
            `🎰 SLOTS\n` +
            `🎲 Bet: *${fmt(bet)}* coin\n\n` +
            gridStr(grid) + '\n\n' +
            msg + '\n' +
            (win
                ? `🏆 Menang: +${fmt(winAmount)} coin (x${mult})\n`
                : `💸 Kalah: -${fmt(bet)} coin\n`) +
            `💰 Dompet: ${fmt(user.money)} coin | Bank: ${fmt(user.bank||0)} coin\n\n` +
            `📊 Sisa judi: ${sisaLimit}`
        )
    }

    // ── BLACKJACK ─────────────────────────────────────────────────
    if (/^(blackjack|bj)$/.test(cmd)) {
        const MIN_BET = 200
        const MAX_BET = 50000
        const subCmd  = (args[0] || '').toLowerCase()

        if (subCmd === 'hit' || subCmd === 'stand') {
            const game = global._bjGames[m.sender]
            if (!game) return m.reply('❌ Tidak ada game aktif!\nKetik *.blackjack <bet>* untuk mulai.')

            if (subCmd === 'hit') {
                game.playerHand.push(game.deck.pop())
                const val = handValue(game.playerHand)
                if (val > 21) {
                    deductWealth(user, game.bet)
                    user.gamblingStats.lose++
                    user.gamblingStats.totalBet += game.bet
                    delete global._bjGames[m.sender]
                    await saveDB()
                    return m.reply(
                        `🃏 BLACKJACK\n\n` +
                        `Kartumu : ${handStr(game.playerHand)}\n` +
                        `Total   : *${val}* — BUST! 💥\n\n` +
                        `💸 Kalah: -${fmt(game.bet)} coin\n` +
                        `💰 Saldo: ${fmt(user.money)} coin`
                    )
                }
                return m.reply(
                    `🃏 BLACKJACK\n\n` +
                    `Kartumu : ${handStr(game.playerHand)}\n` +
                    `Total   : *${val}*\n\n` +
                    `Dealer  : ${cardStr(game.dealerHand[0])} 🂠\n\n` +
                    `*.bj hit* | *.bj stand*`
                )
            }

            if (subCmd === 'stand') {
                while (handValue(game.dealerHand) < 18) game.dealerHand.push(game.deck.pop())
                const pVal = handValue(game.playerHand)
                const dVal = handValue(game.dealerHand)
                let result, profit
                if (dVal > 21 || pVal > dVal) { result = `🏆 *MENANG!*`; profit = game.bet;  user.gamblingStats.win++  }
                else if (pVal === dVal)        { result = `🤝 *SERI!*`;   profit = 0                                    }
                else                           { result = `💸 *KALAH!*`;  profit = -game.bet; user.gamblingStats.lose++ }
                if (profit > 0) addWealth(user, profit)
                else if (profit < 0) deductWealth(user, Math.abs(profit))
                user.gamblingStats.totalBet += game.bet
                delete global._bjGames[m.sender]

                if (profit > 0) await applyCapAndNotify(user, conn, m.sender)
                await saveDB()

                return m.reply(
                    `🃏 BLACKJACK\n\n` +
                    `Kartumu : ${handStr(game.playerHand)} = *${pVal}*\n` +
                    `Dealer  : ${handStr(game.dealerHand)} = *${dVal}*\n\n` +
                    `${result}\n` +
                    `${profit > 0 ? `🏆 +${fmt(profit)}` : profit < 0 ? `💸 -${fmt(game.bet)}` : `🤝 Seri`} coin\n` +
                    `💰 Dompet: ${fmt(user.money)} coin | Bank: ${fmt(user.bank||0)} coin`
                )
            }
        }

        // Mulai game baru
        const isAllBJ = ['all','semua'].includes((args[0]||'').toLowerCase())

        applyBankTax(user)
        const wealth = totalWealth(user)

        const bet = isAllBJ ? wealth : parseBet(args[0], user.money)
        if (!bet) return m.reply(
            `🃏 *BLACKJACK*\n\n` +
            `*.blackjack <bet>* — mulai game\n` +
            `*.bj all* — taruhan semua (tanpa limit!)\n` +
            `*.bj hit* — ambil kartu\n` +
            `*.bj stand* — berhenti\n\n` +
            `Min: ${fmt(MIN_BET)} | Max: ${fmt(MAX_BET)}\n` +
            `💰 Dompet: ${fmt(user.money)} coin | Bank: ${fmt(user.bank||0)} coin\n\n` +
            `📊 Judi hari ini: ${user.judiCount}/${getJudiLimit(user)}`
        )
        if (wealth <= 0) return m.reply('❌ Uangmu habis!')
        if (!isAllBJ && bet < MIN_BET) return m.reply(`❌ Minimal: ${fmt(MIN_BET)} coin!`)
        if (!isAllBJ && bet > MAX_BET) return m.reply(`❌ Maksimal: ${fmt(MAX_BET)} coin!`)
        if (bet > wealth) return m.reply(`❌ Tidak cukup! Dompet+Bank: ${fmt(wealth)} coin`)
        if (global._bjGames[m.sender]) return m.reply(`⚠️ Ada game aktif!\n*.bj hit* atau *.bj stand*`)

        if (!isAllBJ) {
            const limitCheck = checkJudiLimit(user)
            if (!limitCheck.ok) return m.reply(limitCheck.msg)
        }

        const deck       = createDeckBJ()
        const playerHand = [deck.pop(), deck.pop()]
        const dealerHand = [deck.pop(), deck.pop()]
        global._bjGames[m.sender] = { deck, playerHand, dealerHand, bet }
        const pVal = handValue(playerHand)

        if (pVal === 21) {
            const profit = Math.floor(bet * 1.5)
            addWealth(user, profit)
            user.gamblingStats.win++
            user.gamblingStats.totalBet += bet
            user.judiCount++
            delete global._bjGames[m.sender]
            await applyCapAndNotify(user, conn, m.sender)
            await saveDB()
            return m.reply(
                `🃏 BLACKJACK\n\n` +
                `Kartumu : ${handStr(playerHand)} = *21*\n\n` +
                `🎊 *BLACKJACK! MENANG OTOMATIS!*\n` +
                `🏆 +${fmt(profit)} coin (x1.5)\n` +
                `💰 Saldo: ${fmt(user.money)} coin`
            )
        }

        user.judiCount++
        await saveDB()
        return m.reply(
            `🃏 BLACKJACK\n\n` +
            `Kartumu : ${handStr(playerHand)}\n` +
            `Total   : *${pVal}*\n\n` +
            `Dealer  : ${cardStr(dealerHand[0])} 🂠\n\n` +
            `💵 Bet: ${fmt(bet)} coin\n` +
            `📊 Sisa judi: ${Math.max(0, getJudiLimit(user) - user.judiCount)}x hari ini\n\n` +
            `*.bj hit* ambil kartu | *.bj stand* berhenti`
        )
    }

    // ── COCKFIGHT ─────────────────────────────────────────────────
    if (/^(cockfight|sabung|cf)$/.test(cmd)) {
        const MIN_BET = 300
        const MAX_BET = 200000

        if (!user.chicken) return m.reply(`❌ Belum punya ayam!\n*.buy chicken* — 500 koin`)

        const isAll = (args[0] || '').toLowerCase() === 'all'
        applyBankTax(user)
        const wealth = totalWealth(user)

        const bet = isAll ? wealth : parseBet(args[0], user.money)
        if (!bet) return m.reply(
            `🐓 *SABUNG AYAM*\n\n` +
            `*.cockfight <bet>*\n` +
            `*.cf all* — taruhan semua (bebas min bet)\n\n` +
            `Min: ${fmt(MIN_BET)} | Max: ${fmt(MAX_BET)}\n` +
            `💰 Dompet: ${fmt(user.money)} | Bank: ${fmt(user.bank||0)} coin\n\n` +
            `🐓 *${user.chicken.name}* Lv.${user.chicken.level}\n` +
            `${user.chicken.win}W ${user.chicken.lose}L\n\n` +
            `📊 Judi hari ini: ${user.judiCount}/${getJudiLimit(user)}`
        )
        if (wealth <= 0) return m.reply('❌ Uangmu habis!')
        if (!isAll && bet < MIN_BET) return m.reply(`❌ Minimal: ${fmt(MIN_BET)} coin!`)
        if (!isAll && bet > MAX_BET) return m.reply(`❌ Maksimal: ${fmt(MAX_BET)} coin!`)
        if (bet > wealth) return m.reply(`❌ Tidak cukup! Dompet+Bank: ${fmt(wealth)} coin`)

        const limitCheck = checkJudiLimit(user)
        if (!limitCheck.ok) return m.reply(limitCheck.msg)

        const enemy   = generateChicken()
        enemy.level   = Math.max(1, user.chicken.level + Math.floor(Math.random() * 3) - 1)
        enemy.hp     += enemy.level * 8
        enemy.atk    += enemy.level * 2
        enemy.atk += 2; enemy.def += 1
        const fight   = simulateFight(user.chicken, enemy)

        // cf all: paksa kalah 50% meski menang simulasi
        if (isAll && fight.win && Math.random() < 0.5) {
            fight.win    = false
            fight.myHP   = 0
            fight.enemyHP = Math.max(1, fight.enemyHP)
        }

        if (fight.win) {
            addWealth(user, bet)
            user.chicken.win++
            user.chicken.exp += 30 + Math.floor(Math.random() * 20)
            user.gamblingStats.win++
            const expNeeded = user.chicken.level * 50
            if (user.chicken.exp >= expNeeded) {
                user.chicken.level++
                user.chicken.exp  -= expNeeded
                user.chicken.hp   += 10
                user.chicken.atk  += 2
                user.chicken.def  += 1
                user.chicken.spd  += 1
            }
            await applyCapAndNotify(user, conn, m.sender)
        } else {
            deductWealth(user, bet)
            user.chicken.lose++
            user.chicken.exp += 10
            user.gamblingStats.lose++
        }
        user.gamblingStats.totalBet += bet
        user.judiCount++
        await saveDB()

        return m.reply(
            `🐓 SABUNG AYAM\n` +
            `🎲 Bet: *${fmt(bet)}* coin\n\n` +
            `🐓 *${user.chicken.name}* (Lv.${user.chicken.level})\n` +
            `       VS\n` +
            `🐔 *${enemy.name}* (Lv.${enemy.level})\n\n` +
            fight.log.join('\n') + '\n\n' +
            `HP Akhir: 🐓${fight.myHP} vs 🐔${fight.enemyHP}\n\n` +
            (fight.win ? `🏆 *AYAMMU MENANG!*\n💰 +${fmt(bet)} coin` : `💀 *AYAMMU KALAH!*\n💸 -${fmt(bet)} coin`) + '\n' +
            `Saldo: ${fmt(user.money)} coin\n\n` +
            `📊 Sisa judi: ${Math.max(0, getJudiLimit(user) - user.judiCount)}x hari ini`
        )
    }
}

handler.help = [
    'slot <bet/all>',
    'blackjack <bet>',
    'bj hit/stand',
    'cockfight <bet/all>',
    'chickenstats',
]
handler.tags    = ['game', 'rpg']
handler.command = /^(slot|blackjack|bj|cockfight|sabung|cf|chickenstats)$/i
handler.register= true
handler.limit   = false
handler.exp     = 3

module.exports = handler
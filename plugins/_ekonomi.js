// _ekonomi.js - Sistem Ekonomi Terpadu ShiraoriBOT
// File ini berjalan di background (handler.before) untuk fitur ekonomi global.

const { getDbUser } = require('../lib/jidUtils')

const EKONOMI_CONFIG = {
    catur: {
        menang: 300,
        seri: 50,
        kalah: 10,
    },
    werewolf: {
        menang: 500,
        kalah: 75,
        survive: 100,
    },
    mafia: {
        menang: 800,
        kalah: 100,
    },
    level_up: {
        bonus_per_level: 200,
    },
    chat_aktif: {
        koin_per_pesan: 2,
        cooldown_ms: 60000,
        maks_per_hari: 200,
    },
    toko: {
        petFood: { harga: 150, label: 'Pet Food', item: 'petFood' },
        potion: { harga: 100000, label: 'Potion', item: 'potion' },
        kayu: { harga: 80, label: 'Kayu', item: 'kayu' },
        batu: { harga: 80, label: 'Batu', item: 'batu' },
        besi: { harga: 120, label: 'Besi', item: 'iron' },
        emerald: { harga: 500, label: 'Emerald', item: 'emerald' },
        diamond: { harga: 1000, label: 'Diamond', item: 'diamond' },
    },
    jual: {
        petFood: 75,
        potion: 150,
        kayu: 35,
        batu: 35,
        iron: 55,
        emerald: 220,
        diamond: 450,
        gold: 350,
        sampah: 5,
    },
}

function addKoin(sender, jumlah) {
    const user = getDbUser(sender)
    if (!user) return 0
    user.money = (user.money || 0) + jumlah
    return user.money
}

function today() {
    return new Date().toDateString()
}

let handler = m => m

const AUTO_BANK_THRESHOLD = 10_000_000
const BANK_TAX_RATE = 0.02
const TAX_INTERVAL_MS = 60 * 60 * 1000
const AUTO_DEPOSIT_NOTIFY_COOLDOWN_MS = 10 * 60 * 1000
const AUTO_DEPOSIT_NOTIFY_MIN_AMOUNT = 50_000

let bankTaxStarted = false

function startBankTax() {
    if (bankTaxStarted) return
    bankTaxStarted = true

    async function runTax() {
        const users = global.db?.data?.users
        if (!users) return

        let changed = false
        let totalTaxCollected = 0
        for (const [, user] of Object.entries(users)) {
            if (!user?.registered) continue
            if (!user.bank || user.bank <= 0) continue

            const tax = Math.floor(user.bank * BANK_TAX_RATE)
            if (tax <= 0) continue

            user.bank -= tax
            totalTaxCollected += tax
            if (!user.bankLog) user.bankLog = []
            user.bankLog.unshift({
                type: 'PAJAK',
                amount: -tax,
                note: 'Pajak bank 2%/jam',
                time: Date.now(),
            })
            if (user.bankLog.length > 20) user.bankLog = user.bankLog.slice(0, 20)
            changed = true
        }

        // ── Alirkan pajak ke kas negara ──────────────────────────────
        if (totalTaxCollected > 0) {
            try {
                const { addTaxToTreasury } = require('./negara')
                addTaxToTreasury(totalTaxCollected)
            } catch (_) {}
        }

        if (changed) {
            try { await global.db.write() } catch (_) {}
        }
    }

    if (!global._taxStarted) {
        global._taxStarted = true
        setInterval(runTax, TAX_INTERVAL_MS)
    }
    console.log('[BANK] Pajak 2%/jam aktif')
}

function applyAutoDeposit(user) {
    const money = Number(user.money || 0)
    if (money <= AUTO_BANK_THRESHOLD) return 0

    const autoDeposit = money - AUTO_BANK_THRESHOLD
    user.bank = Number(user.bank || 0) + autoDeposit
    user.money = AUTO_BANK_THRESHOLD
    if (!user.bankLog) user.bankLog = []
    user.bankLog.unshift({
        type: 'AUTO-DEP',
        amount: autoDeposit,
        note: `Auto deposit kelebihan dompet (max ${AUTO_BANK_THRESHOLD.toLocaleString('id-ID')})`,
        time: Date.now(),
    })
    if (user.bankLog.length > 20) user.bankLog = user.bankLog.slice(0, 20)
    return autoDeposit
}

function shouldNotifyAutoDeposit(senderJid, amount) {
    if (amount < AUTO_DEPOSIT_NOTIFY_MIN_AMOUNT) return false
    if (!global._autoDepositNotifyAt) global._autoDepositNotifyAt = {}

    const now = Date.now()
    const last = global._autoDepositNotifyAt[senderJid] || 0
    if (now - last < AUTO_DEPOSIT_NOTIFY_COOLDOWN_MS) return false

    global._autoDepositNotifyAt[senderJid] = now
    return true
}

handler.before = async (m, { conn }) => {
    if (!m.sender) return true
    const user = getDbUser(m.sender)
    if (!user || !user.registered) return true

    startBankTax()

    let shouldSave = false

    const initialAutoDeposit = applyAutoDeposit(user)
    if (initialAutoDeposit > 0) {
        shouldSave = true
        if (shouldNotifyAutoDeposit(m.sender, initialAutoDeposit)) {
            try {
                await conn.sendMessage(m.sender, {
                    text:
                        `🏦 *AUTO DEPOSIT*\n\n` +
                        `Dompetmu melebihi batas maksimal *10.000.000 rupiah*!\n` +
                        `💸 Kelebihan *${initialAutoDeposit.toLocaleString('id-ID')} rupiah* otomatis dipindah ke bank.\n\n` +
                        `👛 Dompet sekarang: *${user.money.toLocaleString('id-ID')} rupiah*\n` +
                        `🏦 Saldo bank: *${user.bank.toLocaleString('id-ID')} rupiah*\n\n` +
                        `_⚠️ Ingat: bank dikenakan pajak 2% per jam!_`,
                })
            } catch (_) {}
        }
    }

    if (m.isGroup && m.text && !m.isBaileys) {
        const now = Date.now()
        const lastChat = user.lastChatKoin || 0
        const todayStr = today()
        const chatKoinHari = user.chatKoinHari === todayStr ? (user.chatKoinJumlah || 0) : 0

        if (
            now - lastChat >= EKONOMI_CONFIG.chat_aktif.cooldown_ms &&
            chatKoinHari < EKONOMI_CONFIG.chat_aktif.maks_per_hari
        ) {
            const gain = EKONOMI_CONFIG.chat_aktif.koin_per_pesan
            user.money = (user.money || 0) + gain
            user.lastChatKoin = now
            user.chatKoinHari = todayStr
            user.chatKoinJumlah = chatKoinHari + gain
            shouldSave = true
        }
    }

    const postRewardAutoDeposit = applyAutoDeposit(user)
    if (postRewardAutoDeposit > 0) shouldSave = true

    if (shouldSave) {
        try { await global.db.write() } catch (_) {}
    }

    return true
}

handler.command = false
handler.disabled = false

module.exports = handler

global.rewardGame = async function (game, sender, hasil) {
    const cfg = EKONOMI_CONFIG[game]
    if (!cfg) return 0
    const koin = cfg[hasil] || 0
    if (koin <= 0) return 0
    addKoin(sender, koin)
    await global.db.write()
    return koin
}

global.rewardLevelUp = async function (sender, newLevel) {
    const koin = EKONOMI_CONFIG.level_up.bonus_per_level * newLevel
    addKoin(sender, koin)
    await global.db.write()
    return koin
}

global.EKONOMI_CONFIG = EKONOMI_CONFIG
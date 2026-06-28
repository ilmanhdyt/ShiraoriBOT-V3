// plugins/dompet.js — Cek uang + tombol navigasi
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()
//
// EXPORTS (dipakai juga oleh judi.js, judibola.js, dll):
//   applyBankTax(user)                              → pajak bank 2%/jam
//   checkWalletCap(user)                            → batas dompet 10 jt
//   notifyWalletCap(conn, senderJid, excess, bank)  → kirim notif DM

const { generateWAMessageFromContent, proto } = require('../lib/baileys-compat')
const findUser = require('../lib/findUser')
const { getDbUser } = require('../lib/jidUtils')
const fmt = n => Number(n || 0).toLocaleString('id-ID')

const SURAT_DURASI   = 3 * 24 * 60 * 60 * 1000
const WALLET_MAX     = 10_000_000
const BANK_TAX_RATE  = 0.02
const BANK_TAX_MS    = 60 * 60 * 1000

// ═══════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════

function applyBankTax(user) {
    if (!user || typeof user.bank !== 'number' || user.bank <= 0) return 0
    const now = Date.now()
    if (!user.lastTax) { user.lastTax = now; return 0 }
    const elapsed = (now - user.lastTax) / (60 * 60 * 1000)
    if (elapsed < 0.01) return 0
    let rate = Math.floor(user.bank * 0.01)
    if (rate < 1000) rate = 1000
    if (rate > 20000) rate = 20000
    const bonus = Math.floor(rate * elapsed)
    if (bonus <= 0) return 0
    user.bank    += bonus
    user.lastTax = now
    return bonus
}

function applyBiayaHidup(user) {
    if (!user || typeof user.money !== 'number' || user.money <= 0) return 0
    const now = Date.now()
    if (!user.lastBiayaHidup) { user.lastBiayaHidup = now; return 0 }
    const elapsed = (now - user.lastBiayaHidup) / (60 * 60 * 1000)
    if (elapsed < 0.01) return 0
    
    let rate = 5000 + Math.floor(user.money * 0.01)
    if (rate > 50000) rate = 50000
    
    let deduction = Math.floor(rate * elapsed)
    if (deduction <= 0) return 0
    if (deduction > user.money) deduction = user.money
    
    user.money -= deduction
    user.lastBiayaHidup = now
    
    try { require('./negara').addTaxToTreasury(deduction) } catch (_) {}
    return deduction
}

function checkWalletCap(user) {
    if (!user || typeof user.money !== 'number') return { triggered: false, excess: 0 }
    if (user.money <= WALLET_MAX) return { triggered: false, excess: 0 }
    const excess = user.money - WALLET_MAX
    user.money   = WALLET_MAX
    user.bank    = (user.bank || 0) + excess
    if (!user.lastTax) user.lastTax = Date.now()
    return { triggered: true, excess }
}

async function notifyWalletCap(conn, senderJid, excess, bankAfter) {
    if (!global._walletCapNotified) global._walletCapNotified = {}
    const now = Date.now()
    if (global._walletCapNotified[senderJid] && (now - global._walletCapNotified[senderJid]) < 3000) return
    global._walletCapNotified[senderJid] = now
    try {
        await conn.sendMessage(senderJid, {
            text:
                `🏦 *AUTO DEPOSIT*\n\n` +
                `Dompetmu melebihi batas maksimal *10.000.000 koin*!\n\n` +
                `💸 Kelebihan *${fmt(excess)} koin* otomatis dipindah ke bank.\n` +
                `👛 Dompet sekarang: *10.000.000 koin*\n` +
                `🏦 Saldo bank: *${fmt(bankAfter)} koin*\n\n` +
                `_⚠️ Ingat: bank memberi bonus bunga tiap jam!_`
        })
    } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════
let handler = async (m, { conn, usedPrefix, participants = [] }) => {
    const rawWho   = m.isGroup && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender

    // ── Lookup: findUser → fallback getDbUser(sender) jika @lid belum di participants ──
    let _dResult = findUser(rawWho, participants, conn)
    if (!_dResult && rawWho !== m.sender) {
        // Dicoba mention user tapi tidak ketemu → coba lookup sender langsung
        _dResult = findUser(m.sender, participants, conn)
    }
    if (!_dResult) {
        // Fallback terakhir: getDbUser langsung
        const _u = getDbUser(m.sender)
        if (_u) _dResult = { user: _u, jid: m.sender }
    }
    if (!_dResult) return m.reply('❌ Data user tidak ditemukan! Pastikan kamu sudah *.daftar*')
    const { user, jid: resolvedJid } = _dResult

    const bonusBank = applyBankTax(user)
    const biayaHidup = applyBiayaHidup(user)
    const capResult = checkWalletCap(user)

    if (capResult.triggered) {
        global.db.write().catch(() => {})
        const notifTarget = resolvedJid.includes('@') ? resolvedJid : resolvedJid + '@s.whatsapp.net'
        notifyWalletCap(conn, notifTarget, capResult.excess, user.bank).catch(() => {})
    } else if (bonusBank > 0 || biayaHidup > 0) {
        global.db.write().catch(() => {})
    }

    const name = user.name || conn.getName(rawWho) || 'Unknown'

    let suratLine = '│  📜 *Surat Nikah:* ❌ Tidak ada'
    if (user.suratNikah?.diisi) {
        const expired = user.suratNikah.diisi + SURAT_DURASI
        const sisaMs  = expired - Date.now()
        if (sisaMs <= 0) {
            if (resolvedJid === m.sender) {
                user.gender     = null
                user.suratNikah = null
                await global.db.write()
            }
            suratLine = '│  📜 *Surat Nikah:* ❌ Kadaluarsa\n│     _(ketik .suratnikan untuk isi ulang)_'
        } else {
            const sisaHari = Math.floor(sisaMs / (24 * 60 * 60 * 1000))
            const sisaJam  = Math.floor((sisaMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
            const sisaMnt  = Math.floor((sisaMs % (60 * 60 * 1000)) / (60 * 1000))
            const gender   = user.gender === 'pria' ? '👨 Pria' : '👩 Wanita'
            const sisaStr  = sisaHari > 0 ? `${sisaHari} hari ${sisaJam} jam` : `${sisaJam} jam ${sisaMnt} menit`
            suratLine = `│  📜 *Surat Nikah:* ✅ Ada (${gender})\n│  ⏳ *Expired dalam:* ${sisaStr}`
        }
    }

    const bodyText = [
        '╭─「 💰 *DOMPET* 」',
        '│',
        `│  👤 *${name}*`,
        `│  💵 *Uang:* ${fmt(user.money)} rupiah${biayaHidup > 0 ? ` _(biaya hidup -${fmt(biayaHidup)})_` : ''}`,
        '│',
        suratLine,
        '│',
        '│  Pilih menu di bawah:',
        '╰─────────────────',
    ].filter(Boolean).join('\n')

    const wm = global.wm || global.namabot || 'ShiraoriBOT'

    const buttons = [
        ['🎒 Inventory', `${usedPrefix}inv`],
        ['🏦 Bank', `${usedPrefix}bank`],
        ['📋 Menu', `${usedPrefix}menu`]
    ]
    return conn.sendButton(m.chat, bodyText, wm, buttons, m)
}

handler.help     = ['dompet']
handler.tags     = ['ekonomi']
handler.command  = /^(dompet|wallet|saldo)$/i
handler.register = true
handler.exp      = 0

module.exports = handler
module.exports.applyBankTax    = applyBankTax
module.exports.checkWalletCap  = checkWalletCap
module.exports.notifyWalletCap = notifyWalletCap
module.exports.WALLET_MAX      = WALLET_MAX
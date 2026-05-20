// plugins/dompet.js — Cek uang + tombol navigasi
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()
//
// EXPORTS (dipakai juga oleh judi.js, judibola.js, dll):
//   applyBankTax(user)                              → pajak bank 2%/jam
//   checkWalletCap(user)                            → batas dompet 10 jt
//   notifyWalletCap(conn, senderJid, excess, bank)  → kirim notif DM

const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys')
const findUser = require('../lib/findUser')
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
    const elapsed = (now - user.lastTax) / BANK_TAX_MS
    if (elapsed < 0.01) return 0
    const tax = Math.floor(user.bank * BANK_TAX_RATE * elapsed)
    if (tax <= 0) return 0
    user.bank    = Math.max(0, user.bank - tax)
    user.lastTax = now
    return tax
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
                `_⚠️ Ingat: bank dikenakan pajak 2% per jam!_`
        })
    } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════
//  HANDLER
// ═══════════════════════════════════════════════════════════════════
let handler = async (m, { conn, usedPrefix, participants = [] }) => {
    const rawWho   = m.isGroup && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender
    const _dResult = findUser(rawWho, participants, conn)
    if (!_dResult) return m.reply('❌ Data user tidak ditemukan!')
    const { user, jid: resolvedJid } = _dResult

    const taxPotong = applyBankTax(user)
    const capResult = checkWalletCap(user)

    if (capResult.triggered) {
        global.db.write().catch(() => {})
        const notifTarget = resolvedJid.includes('@') ? resolvedJid : resolvedJid + '@s.whatsapp.net'
        notifyWalletCap(conn, notifTarget, capResult.excess, user.bank).catch(() => {})
    } else if (taxPotong > 0) {
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
        `│  💵 *Uang:* ${fmt(user.money)} rupiah`,
        '│',
        suratLine,
        '│',
        '│  Pilih menu di bawah:',
        '╰─────────────────',
    ].filter(Boolean).join('\n')

    const wm = global.wm || global.namabot || 'ShiraoriBOT'

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🎒 Inventory', id: `${usedPrefix}inv`  }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🏦 Bank',      id: `${usedPrefix}bank` }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',      id: `${usedPrefix}menu` }) },
    ]

    try {
        const msg = generateWAMessageFromContent(
            m.chat,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {},
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            header: { title: '💰 Dompet', hasMediaAttachment: false },
                            body  : { text: bodyText },
                            footer: { text: wm },
                            nativeFlowMessage: { buttons },
                        }),
                    },
                },
            },
            { userJid: conn.user.id, quoted: m }
        )
        await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })
    } catch (e) {
        console.error('[dompet] gagal kirim interactive:', e.message)
        try {
            await conn.sendMessage(m.chat, { text: bodyText }, { quoted: m })
        } catch (e2) {
            console.error('[dompet] fallback gagal:', e2.message)
        }
    }
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
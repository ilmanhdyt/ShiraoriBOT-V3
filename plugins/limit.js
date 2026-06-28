// plugins/limit.js
// ═══════════════════════════════════════════════════════════════════
//  📋 PLUGIN: .limit — Cek Sisa Limit Harian
// ═══════════════════════════════════════════════════════════════════

'use strict'

const { generateWAMessageFromContent, proto } = require('../lib/baileys-compat')
const { getDbUser } = require('../lib/jidUtils')

// ─────────────────────────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────────────────────────

const MAX_LIMIT = 200

function buildProgressBar(current, max, length = 10) {
    if (current === null) return '▓'.repeat(length)
    const filled = Math.round((Math.min(current, max) / max) * length)
    return '▓'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, length - filled))
}

function limitLabel(current, max) {
    if (current === null) return '💎 UNLIMITED'
    const pct = current / max
    if (pct <= 0)   return '🔴 HABIS'
    if (pct <= 0.2) return '🟠 KRITIS'
    if (pct <= 0.5) return '🟡 SEDANG'
    return '🟢 AMAN'
}

// ─────────────────────────────────────────────────────────────────
//  HANDLER
// ─────────────────────────────────────────────────────────────────

let handler = async function (m, { conn, isPrems }) {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Kamu belum terdaftar! Ketik *.daftar* dulu.'

    const wm        = global.wm || global.namabot || 'ShiraoriBOT'
    const sisaLimit = isPrems ? null : (user.limit ?? 10)
    const bar       = buildProgressBar(sisaLimit, MAX_LIMIT)
    const label     = limitLabel(sisaLimit, MAX_LIMIT)

    const bodyText = [
        '╭─「 📋 *INFO LIMIT* 」',
        '│',
        `│  👤 *Nama:* ${user.name || 'User'}`,
        `│  🏷️ *Status:* ${isPrems ? '⭐ Premium' : '👤 Regular'}`,
        '│',
        ...(isPrems ? [
            '│  ✨ *Limit:* UNLIMITED',
            `│  ${bar} ∞`,
            '│',
            '│  💎 Sebagai user *Premium*, kamu bisa',
            '│  menggunakan semua fitur tanpa batas!',
        ] : [
            '│  ⚡ *Limit Tersisa:*',
            `│  ${bar}`,
            `│  ${sisaLimit} / ${MAX_LIMIT}  —  ${label}`,
            '│',
            ...(sisaLimit <= 0
                ? ['│  🚫 *Limitmu sudah habis!*']
                : sisaLimit <= 5
                    ? ['│  ⚠️ Limitmu hampir habis!']
                    : ['│  💡 Beli limit tambahan di bawah 👇']
            ),
        ]),
        '╰─────────────────',
    ].join('\n')

    const buttons = [
        {
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: '🛒 Buy Limit', id: '.buy limit' }),
        },
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
                            header: {
                                title             : '📋 Limit',
                                hasMediaAttachment: false,
                            },
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
        console.error('[limit] gagal kirim interactive:', e.message)
        // Fallback: teks biasa + instruksi manual
        await conn.sendMessage(
            m.chat,
            { text: bodyText + '\n\n🛒 Ketik *.buy limit* untuk beli limit.' },
            { quoted: m }
        )
    }
}

// ─────────────────────────────────────────────────────────────────
//  METADATA PLUGIN
// ─────────────────────────────────────────────────────────────────

handler.help     = ['limit - cek sisa limit harian']
handler.tags     = ['info', 'rpg']
handler.command  = /^limit$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.register = true
handler.exp      = 0
handler.limit    = 0

module.exports = handler
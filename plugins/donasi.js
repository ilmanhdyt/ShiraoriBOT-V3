// plugins/donasi.js — Info donasi + tombol navigasi
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()

const fs   = require('fs')
const path = require('path')
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys')

function getQrisImage() {
    // Prioritas utama: qris.jpg
    const candidates = [
        path.join(__dirname, '../media/qris.jpg'),
        path.join(__dirname, '../media/qris.png'),
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) return { buf: fs.readFileSync(p), mime: p.endsWith('.png') ? 'image/png' : 'image/jpeg' }
        } catch (_) {}
    }
    return null
}

let handler = async (m, { conn }) => {
    const botName = global.namabot || 'ShiraoriBOT'
    const wm      = global.wm     || botName
    const owner   = (global.owner?.[0] || '').replace(/[^0-9]/g, '')
    const img     = getQrisImage()

    const bodyText = [
        '╭─「 💖 *DONASI* 」',
        '│',
        `│  Terima kasih sudah menggunakan *${botName}*!`,
        '│',
        '│  Kalau kamu merasa terbantu dan ingin',
        '│  mendukung pengembangan bot ini,',
        '│  kamu bisa donasi ke owner ya 🙏',
        '│',
        `│  👑 *Owner:* @${owner}`,
        '│',
        '│  💳 Scan QRIS di atas untuk donasi',
        '╰─────────────────',
    ].join('\n')

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Hubungi Owner', id: '.owner' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',          id: '.menu'  }) },
    ]

    // ── Coba kirim interactive message ──────────────────────────
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
                                title           : '💖 Donasi',
                                hasMediaAttachment: false,
                            },
                            body  : { text: bodyText },
                            footer: { text: wm },
                            nativeFlowMessage: { buttons },
                            contextInfo: {
                                mentionedJid: owner ? [`${owner}@s.whatsapp.net`] : [],
                            },
                        }),
                    },
                },
            },
            { userJid: conn.user.id, quoted: m }
        )

        await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })

        // Kirim gambar QRIS terpisah setelah interactive message
        if (img) {
            await conn.sendMessage(
                m.chat,
                { image: img.buf, caption: '💳 *QRIS Donasi*\nScan untuk donasi 🙏', mimetype: img.mime },
                { quoted: m }
            )
        }

    } catch (e) {
        // ── Fallback: kirim gambar QRIS + teks biasa ────────────
        console.error('[donasi] gagal kirim interactive:', e.message)
        try {
            if (img) {
                await conn.sendMessage(
                    m.chat,
                    { image: img.buf, caption: bodyText, mimetype: img.mime },
                    { quoted: m }
                )
            } else {
                await conn.sendMessage(
                    m.chat,
                    { text: bodyText },
                    { quoted: m }
                )
            }
        } catch (e2) {
            console.error('[donasi] fallback gagal:', e2.message)
        }
    }
}

handler.help    = ['donasi']
handler.tags    = ['info']
handler.command = /^donasi$/i

module.exports = handler
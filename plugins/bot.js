// plugins/bot.js
// Respon "bot / tes / test" — gambar + 3 tombol interaktif
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()

const fs   = require('fs')
const path = require('path')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('../lib/baileys-compat')

let cachedMenuImage

function getMenuImage() {
    if (cachedMenuImage !== undefined) return cachedMenuImage
    const candidates = [
        path.join(__dirname, '../media/menu_bg.jpg'),
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                cachedMenuImage = fs.readFileSync(p)
                return cachedMenuImage
            }
        } catch (_) {}
    }
    cachedMenuImage = null
    return cachedMenuImage
}

let handler = async (m, { conn }) => {}

handler.all = async function (m, chatUpdate) {
    const conn = this
    if (!m.text)                                   return
    if (m.fromMe)                                  return
    if (!/^(bot|tes|test)$/i.test(m.text.trim())) return

    const botName = global.namabot || 'ShiraoriBOT'
    const wm      = global.wm || botName
    const imgBuf  = getMenuImage()

    const bodyText =
        `✅ *${botName}* — Online & Siap!\n\n` +
        `📋 *.menu* — Semua fitur lengkap\n` +
        `👑 *.owner* — Hubungi owner\n` +
        `🔗 *.sc* — Source code bot\n\n` +
        `_${wm}_`

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',        id: '.menu'  }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '💖 Donasi',       id: '.donasi' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔗 Source Code', id: '.sc'    }) },
    ]

    try {
        let header

        if (imgBuf) {
            try {
                const uploaded = await prepareWAMessageMedia(
                    { image: imgBuf },
                    { upload: conn.waUploadToServer }
                )
                header = proto.Message.InteractiveMessage.Header.create({
                    ...uploaded,
                    hasMediaAttachment: true,
                })
            } catch (e) {
                console.error('[bot] prepareWAMessageMedia gagal:', e.message)
                header = { title: botName, hasMediaAttachment: false }
            }
        } else {
            header = { title: botName, hasMediaAttachment: false }
        }

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
                            header,
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
        console.error('[bot] gagal kirim interactive:', e.message)
        try {
            if (imgBuf) {
                await conn.sendMessage(m.chat, { image: imgBuf, caption: bodyText, mimetype: 'image/jpeg' }, { quoted: m })
            } else {
                await conn.sendMessage(m.chat, { text: bodyText }, { quoted: m })
            }
        } catch (e2) {
            console.error('[bot] fallback gagal:', e2.message)
        }
    }
}

handler.command = false
module.exports  = handler

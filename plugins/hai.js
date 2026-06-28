// plugins/hai.js — Respon "hai" dengan gambar + tombol interaktif
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()

const fs   = require('fs')
const path = require('path')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('../lib/baileys-compat')

function getMenuImage() {
    const candidates = [
        path.join(__dirname, '../media/menu_bg.jpg'),
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return fs.readFileSync(p) } catch (_) {}
    }
    return null
}

let handler = async (m, { conn }) => {}

handler.command = handler.all = async function (m, chatUpdate) {
    const conn = this
    if (!m.text)                           return
    if (m.fromMe)                          return
    if (m._isLikelyCommand)                return  // ★ skip: ini command bukan chat biasa
    if (!/^hai$/i.test(m.text.trim()))     return

    const botName = global.namabot || 'ShiraoriBOT'
    const wm      = global.wm || botName
    const imgBuf  = getMenuImage()

    const bodyText = `✅ *${botName}* aktif!\n\nPilih menu di bawah:`

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',     id: '.menu'    }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📊 Info Bot', id: '.infobot' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👤 Profil',   id: '.my'      }) },
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
                console.error('[hai] prepareWAMessageMedia gagal:', e.message)
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
        console.error('[hai] gagal kirim interactive:', e.message)
        try {
            if (imgBuf) {
                await conn.sendMessage(m.chat, { image: imgBuf, caption: bodyText, mimetype: 'image/jpeg' }, { quoted: m })
            } else {
                await conn.sendMessage(m.chat, { text: bodyText }, { quoted: m })
            }
        } catch (e2) {
            console.error('[hai] fallback gagal:', e2.message)
        }
    }
}

module.exports = handler
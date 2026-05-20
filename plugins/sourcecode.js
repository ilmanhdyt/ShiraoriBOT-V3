// plugins/sourcecode.js — Info source code + tombol navigasi
// Format: nativeFlowMessage via proto.Message.InteractiveMessage.create()
/**
 * jangan ganti ya kakak kakak sekalian
 * ini cuma buat ninggalin credit gw doang :)
 **/

const fs   = require('fs')
const path = require('path')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys')

let handler = async (m, { conn }) => {
    const wm = global.wm || global.namabot || 'ShiraoriBOT'

    const bodyText =
        `*Source Code*\n\n` +
        `Bot ini menggunakan script dari:\n` +
        `https://github.com/ilmanhdyt/ShiraoriBOT-v3\n\n` +
        `_Ini hanyalah base-nya. Untuk fitur lengkap silakan hubungi owner._\n\nMasukin Grup? Beli Script nya? chat aja owner,pencet tombol owner dibawah`

    let imgBuf = null
    for (const p of [
        path.join(__dirname, '../media/menu_bg.jpg'),
        path.join(__dirname, '../media/shiraori.jpg'),
    ]) {
        if (fs.existsSync(p)) { imgBuf = fs.readFileSync(p); break }
    }

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Owner', id: '.owner' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',  id: '.menu'  }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📥 Unduh Sc',  id: '.gitclone https://github.com/ilmanhdyt/ShiraoriBOT-v3'  }) },
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
                console.error('[sourcecode] prepareWAMessageMedia gagal:', e.message)
                header = { title: 'Source Code', hasMediaAttachment: false }
            }
        } else {
            header = { title: 'Source Code', hasMediaAttachment: false }
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
        console.error('[sourcecode] gagal kirim interactive:', e.message)
        try {
            if (imgBuf) {
                await conn.sendMessage(m.chat, { image: imgBuf, caption: bodyText, mimetype: 'image/jpeg' }, { quoted: m })
            } else {
                await conn.sendMessage(m.chat, { text: bodyText }, { quoted: m })
            }
        } catch (e2) {
            console.error('[sourcecode] fallback gagal:', e2.message)
        }
    }
}

handler.help    = ['sc', 'sourcecode']
handler.tags    = ['info']
handler.command = /^(sc|sourcecode)$/i

module.exports = handler
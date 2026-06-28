// plugins/antiviewonce.js — Buka & kirim ulang foto/video sekali lihat
// Command : .ihh  (reply ke pesan viewonce)

const { downloadContentFromMessage } = require('../lib/baileys-compat')

// ─── Download buffer dari mediaMessage ───────────────────────────────────────
async function downloadMedia(mediaMsg, type) {
    const stream = await downloadContentFromMessage(mediaMsg, type)
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
    }
    return buffer
}

// ─── Cari inner imageMessage / videoMessage dari berbagai struktur ────────────
function getInnerMedia(msgObj) {
    if (!msgObj) return null

    // Semua kemungkinan key viewonce di Baileys
    const voKeys = [
        'viewOnceMessage',
        'viewOnceMessageV2',
        'viewOnceMessageV2Extension',
    ]

    for (const key of voKeys) {
        const vo = msgObj[key]
        if (!vo) continue

        // Struktur 1: vo.message.imageMessage / vo.message.videoMessage
        const inner = vo.message
        if (inner?.imageMessage) return { media: inner.imageMessage, type: 'image' }
        if (inner?.videoMessage) return { media: inner.videoMessage, type: 'video' }

        // Struktur 2: vo.imageMessage / vo.videoMessage langsung
        if (vo.imageMessage) return { media: vo.imageMessage, type: 'image' }
        if (vo.videoMessage) return { media: vo.videoMessage, type: 'video' }
    }

    // Struktur 3: langsung di root msgObj (sudah di-unwrap smsg)
    if (msgObj.imageMessage) return { media: msgObj.imageMessage, type: 'image' }
    if (msgObj.videoMessage) return { media: msgObj.videoMessage, type: 'video' }

    return null
}

// ─── Command Handler: .ihh ────────────────────────────────────────────────────
let handler = async (m, { conn, usedPrefix, command }) => {
    const q = m.quoted
    if (!q) {
        return m.reply(
            `❌ *Reply ke pesan sekali lihat dulu!*\n\n` +
            `Contoh: balas foto/video sekali lihat lalu ketik *${usedPrefix}${command}*`
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    let buffer = null
    let mediaType = null
    let mimetype  = null

    // ── Metode 1: lewat m.quoted.message (raw) ───────────────────
    try {
        const rawMsg = q.message || q.msg || {}
        const found  = getInnerMedia(rawMsg)

        if (found) {
            mediaType = found.type
            mimetype  = found.media.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
            buffer    = await downloadMedia(found.media, mediaType)
        }
    } catch (e) {
        console.error('[ihh] metode 1 gagal:', e.message)
    }

    // ── Metode 2: cek mtype dari smsg() result ───────────────────
    if (!buffer || !buffer.length) {
        try {
            const qMtype = q.mtype || ''
            const isImg  = /image/i.test(qMtype)
            const isVid  = /video/i.test(qMtype)

            if (isImg || isVid) {
                // q.msg adalah hasil smsg — bisa langsung download
                const mediaMsg = q.msg || {}
                mediaType = isVid ? 'video' : 'image'
                mimetype  = mediaMsg.mimetype || (isVid ? 'video/mp4' : 'image/jpeg')
                buffer    = await downloadMedia(mediaMsg, mediaType)
            }
        } catch (e) {
            console.error('[ihh] metode 2 gagal:', e.message)
        }
    }

    // ── Metode 3: fallback q.download() dari smsg ────────────────
    if (!buffer || !buffer.length) {
        try {
            if (typeof q.download === 'function') {
                buffer = await q.download()
                const mime = (q.msg || q).mimetype || ''
                mediaType  = /video/i.test(mime) ? 'video' : 'image'
                mimetype   = mime || 'image/jpeg'
            }
        } catch (e) {
            console.error('[ihh] metode 3 gagal:', e.message)
        }
    }

    // ── Metode 4: cek contextInfo.quotedMessage raw ───────────────
    if (!buffer || !buffer.length) {
        try {
            const rawCtx = m.msg?.contextInfo?.quotedMessage || {}
            const found  = getInnerMedia(rawCtx)
            if (found) {
                mediaType = found.type
                mimetype  = found.media.mimetype || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
                buffer    = await downloadMedia(found.media, mediaType)
            }
        } catch (e) {
            console.error('[ihh] metode 4 gagal:', e.message)
        }
    }

    if (!buffer || !buffer.length) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(
            '❌ *Gagal membuka pesan sekali lihat.*\n\n' +
            'Kemungkinan sebab:\n' +
            '• Media sudah expired\n' +
            '• Bukan foto/video sekali lihat\n' +
            '• Reply ke reply (harus reply langsung ke viewonce-nya)'
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '👁️', key: m.key } })

    const caption = `👁️ *Pesan Sekali Lihat*\n_Dibuka oleh ShiraoriBOT_`

    if (mediaType === 'video') {
        await conn.sendMessage(m.chat, {
            video: buffer,
            caption,
            mimetype: mimetype || 'video/mp4',
            gifPlayback: false
        }, { quoted: m })
    } else {
        await conn.sendMessage(m.chat, {
            image: buffer,
            caption,
            mimetype: mimetype || 'image/jpeg'
        }, { quoted: m })
    }
}


handler.command  = /^ihh$/i

handler.description = 'Buka foto/video sekali lihat'
handler.owner    = false
handler.premium  = false
handler.admin    = false
handler.group    = false
handler.private  = false
handler.register = false
handler.exp      = 0
handler.limit    = false

module.exports = handler
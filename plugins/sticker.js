// plugins/sticker.js — Buat stiker tanpa sharp (pakai ffmpeg + addExif)
// FIXED: ganti sticker5 (wa-sticker-formatter/sharp) → sticker4 + addExif

const { sticker4, addExif } = require('../lib/sticker')

// Buat stiker dari buffer, tambahkan EXIF packname/author
async function makeSticker(buf, packname, author) {
    const result = await sticker4(buf, false)
    // FIXED: ambil .data jika return object, bukan Buffer langsung
    const webp = Buffer.isBuffer(result) ? result : result?.data
    if (!webp) throw '❌ ffmpeg gagal menghasilkan output.'
    try {
        return await addExif(webp, packname, author)
    } catch (_) {
        return webp
    }
}

// Buat stiker dari URL
async function makeStickerUrl(url, packname, author) {
    const result = await sticker4(false, url)
    // FIXED: sama, ekstrak .data
    const webp = Buffer.isBuffer(result) ? result : result?.data
    if (!webp) throw '❌ ffmpeg gagal menghasilkan output.'
    try {
        return await addExif(webp, packname, author)
    } catch (_) {
        return webp
    }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    await conn.sendMessage(m.chat, { react: { text: '🎨', key: m.key } })

    const q        = m.quoted ? m.quoted : m
    const mime     = (q.msg || q).mimetype || ''
    const packname = global.packname || global.wm || global.namabot || 'ShiraoriBOT'
    const author   = global.author   || global.wm || 'ShiraoriBOT'
    const waitMsg  = global.stiker_wait || '⏳ Stiker sedang dibuat...'

    let stiker = null

    if (/webp|image/.test(mime)) {
        const media = await q.download()
        if (!media) throw '❌ Gagal mengunduh media.'
        m.reply(waitMsg)
        // FIXED: sticker4 (ffmpeg) — tidak butuh sharp/canvas
        // Wrapped in media queue agar ffmpeg tidak block event loop command lain
        stiker = await global.queueManager.add('media', () => makeSticker(media, packname, author))

    } else if (/video/.test(mime)) {
        const seconds = (q.msg || q).seconds || 0
        if (seconds > 10) throw (
            `❌ Maksimal video 10 detik.\n\n` +
            `Balas video lalu ketik *${usedPrefix + command}*`
        )
        const media = await q.download()
        if (!media) throw '❌ Gagal mengunduh video.'
        m.reply(waitMsg)
        // FIXED: sticker4 support video/gif juga via ffmpeg
        // Wrapped in media queue agar ffmpeg tidak block event loop command lain
        stiker = await global.queueManager.add('media', () => makeSticker(media, packname, author))

    } else {
        const text = (args.join(' ').trim() || m.quoted?.text || '').trim()
        if (isUrl(text)) {
            m.reply(waitMsg)
            stiker = await global.queueManager.add('media', () => makeStickerUrl(text, packname, author))
        } else {
            throw (
                `❌ Balas gambar/video/gif lalu ketik *${usedPrefix + command}*\n\n` +
                `Atau kirim URL:\n*${usedPrefix + command} https://example.com/image.jpg*`
            )
        }
    }

    if (!stiker) throw '❌ Stiker gagal dibuat.'

    await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
}

handler.help    = ['sticker', 's']
handler.tags    = ['sticker']
handler.command = /^(stiker|s|sticker)$/i

module.exports = handler

function isUrl(text) {
    if (!text) return false
    return /https?:\/\/[^\s]+?\.(jpe?g|png|gif|webp|mp4)(\?.*)?$/i.test(text)
}
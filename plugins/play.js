const fetch = require('node-fetch')

const LEXCODE_API = 'https://api.lexcode.biz.id/api/dwn/ytplay'

async function searchAndGetAudio(query) {
    const url = `${LEXCODE_API}?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) throw new Error(`API error: HTTP ${res.status}`)
    const json = await res.json()
    if (!json.status || !json.result) throw new Error('API tidak menemukan hasil')
    return json.result
}

async function downloadBuffer(url) {
    const res = await fetch(url, {
        timeout: 120000,
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.youtube.com/'
        }
    })
    if (!res.ok) throw new Error(`Download gagal: HTTP ${res.status}`)
    return res.buffer()
}

let handler = async (m, { conn, text, usedPrefix }) => {
    if (!text) return m.reply(
        `🎵 *YouTube Audio Downloader*\n\n` +
        `Cara pakai:\n` +
        `• *${usedPrefix}play* <judul lagu>\n` +
        `• *${usedPrefix}play* <link YouTube>\n\n` +
        `Contoh:\n` +
        `• ${usedPrefix}play terbuang dalam waktu\n` +
        `• ${usedPrefix}play https://youtu.be/xxx`
    )

    await m.reply('🔍 *Mencari lagu...*')

    let result
    try {
        result = await searchAndGetAudio(text)
    } catch (e) {
        return m.reply(`❌ *Gagal mencari lagu!*\n\nError: ${e.message}`)
    }

    const {
        title = 'Unknown',
        channel = 'Unknown',
        views = '-',
        duration = '-',
        thumbnail,
        url: ytUrl,
        download
    } = result

    const audioUrl = download?.audio
    if (!audioUrl) return m.reply('❌ Link audio tidak tersedia dari API.')

    try {
        const caption =
            `🎵 *${title}*\n\n` +
            `👤 Channel : ${channel}\n` +
            `⏱️ Durasi  : ${duration}\n` +
            `👁️ Views   : ${views}\n` +
            `🔗 ${ytUrl || ''}\n\n` +
            `⏳ *Sedang mengunduh audio...*`

        if (thumbnail) {
            await conn.sendMessage(m.chat, {
                image: { url: thumbnail },
                caption
            }, { quoted: m })
        } else {
            await m.reply(caption)
        }
    } catch (_) {}

    let buffer
    try {
        buffer = await downloadBuffer(audioUrl)
    } catch (e) {
        return m.reply(`❌ *Gagal mengunduh audio!*\n\nError: ${e.message}`)
    }

    const safeTitle = title.replace(/[^\w\s\-]/g, '').trim().slice(0, 60) || 'audio'
    try {
        await conn.sendMessage(m.chat, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`,
            ptt: false
        }, { quoted: m })
    } catch (e) {
        return m.reply(`❌ *Gagal mengirim audio!*\n\nError: ${e.message}`)
    }
}

handler.command = 'play'
handler.tags = ['downloader']
handler.help = ['play <judul/link>']
handler.description = 'Download audio YouTube via LexCode API'
handler.register = true
handler.limit = 3
module.exports = handler
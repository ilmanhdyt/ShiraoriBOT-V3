const fetch = require('node-fetch')

function pickFirstUrl(val) {
    if (!val) return null
    if (typeof val === 'string') {
        const parts = val.split(/,(?=https?:\/\/)/)
        return parts[0].trim() || null
    }
    if (Array.isArray(val)) return val[0] || null
    return null
}

let handler = async (m, { conn, text, usedPrefix }) => {
    if (!text) return m.reply(
        `❌ *Masukkan link TikTok!*\n\n` +
        `Contoh:\n` +
        `*${usedPrefix}tiktok* https://vt.tiktok.com/xxxxx\n` +
        `*${usedPrefix}tiktok* https://www.tiktok.com/@user/video/xxxxx`
    )

    const url = text.trim()
    if (!/tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url)) {
        return m.reply('❌ Link tidak valid! Harus link TikTok.')
    }

    await m.reply('⏳ _Sedang mendownload, tunggu sebentar..._')

    let data
    try {
        const apiUrl = `https://api.lexcode.biz.id/api/dwn/tiktok?url=${encodeURIComponent(url)}`
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 25000
        })

        if (res.status >= 500) {
            m.limit = 0
            return m.reply(
                `⚠️ *Server download sedang bermasalah (${res.status}).*\n\n` +
                `✅ Limit kamu tidak jadi berkurang.\n` +
                `🔄 Coba lagi beberapa saat nanti.`
            )
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
    } catch (e) {
        console.error('[tiktok] fetch error:', e.message)
        m.limit = 0
        return m.reply(
            `⚠️ *Gagal menghubungi server.*\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n` +
            `🔄 Coba lagi beberapa saat nanti.\n\n` +
            `_Error: ${e.message}_`
        )
    }

    if (!data || data.success === false) {
        return m.reply(
            '❌ Gagal download!\n\n' +
            (data?.message || data?.error || 'Link mungkin expired atau tidak valid.')
        )
    }

    const r = data.result || {}
    const videoUrl = pickFirstUrl(r.video_nowm || r.nowm || r.video || r.play || r.wm || null)
    const audioUrl = pickFirstUrl(r.music || r.audio || null)
    const title = r.title || r.desc || ''
    const author = r.username || r.author || ''
    const duration = r.duration || ''
    const views = r.stats?.views || ''
    const likes = r.stats?.likes || ''

    if (!videoUrl) {
        console.error('[tiktok] key tersedia:', Object.keys(r))
        m.limit = 0
        return m.reply(
            '❌ Gagal ambil URL video.\n\n' +
            '✅ Limit kamu tidak jadi berkurang.\n\n' +
            '📋 Key tersedia:\n' + Object.keys(r).join(', ') + '\n\n' +
            'Screenshot dan kirim ke owner bot.'
        )
    }

    const caption =
        `🎵 *TikTok Downloader*\n\n` +
        (author ? `👤 *User:* @${author}\n` : '') +
        (title ? `📝 *Judul:* ${title.slice(0, 120)}\n` : '') +
        (duration ? `⏱️ *Durasi:* ${duration}\n` : '') +
        (views ? `👁️ *Views:* ${views}\n` : '') +
        (likes ? `❤️ *Likes:* ${likes}\n` : '') +
        `\n_Powered by ShiraoriBOT_`

    try {
        await conn.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption,
            mimetype: 'video/mp4',
        }, { quoted: m })

        if (audioUrl) {
            await conn.sendMessage(m.chat, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                ptt: false,
            }, { quoted: m })
        }
    } catch (e) {
        console.error('[tiktok] send error:', e.message)
        m.limit = 0
        return m.reply(
            `⚠️ Gagal kirim file.\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n\n` +
            `📥 *Link Video:*\n${videoUrl}\n\n` +
            (audioUrl ? `🎵 *Link Audio:*\n${audioUrl}` : '')
        )
    }
}

handler.help = ['tiktok <url>']
handler.tags = ['downloader']
handler.command = /^(tiktok|tt|tikdl)$/i
handler.owner = false
handler.mods = false
handler.premium = false
handler.group = false
handler.private = false
handler.admin = false
handler.botAdmin = false
handler.exp = 3
handler.limit = 5
handler.register = false

module.exports = handler

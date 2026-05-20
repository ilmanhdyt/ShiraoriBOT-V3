const fetch = require('node-fetch')

let handler = async (m, { conn, text, usedPrefix }) => {
    if (!text) return m.reply(
        `❌ *Masukkan link Instagram!*\n\n` +
        `Contoh:\n` +
        `*${usedPrefix}ig* https://www.instagram.com/p/xxxxx\n` +
        `*${usedPrefix}ig* https://www.instagram.com/reel/xxxxx\n` +
        `*${usedPrefix}ig* https://www.instagram.com/stories/user/xxxxx`
    )

    const url = text.trim()
    if (!/instagram\.com|instagr\.am/i.test(url)) {
        return m.reply('❌ Link tidak valid! Harus link Instagram.')
    }

    await m.reply('⏳ _Sedang mendownload, tunggu sebentar..._')

    let data
    try {
        const apiUrl = `https://api.neoxr.eu/api/ig?url=${encodeURIComponent(url)}&apikey=udo44T`
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
        console.error('[instagram] fetch error:', e.message)
        m.limit = 0
        return m.reply(
            `⚠️ *Gagal menghubungi server.*\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n` +
            `🔄 Coba lagi beberapa saat nanti.\n\n` +
            `_Error: ${e.message}_`
        )
    }

    // Response neoxr: { status: true, data: [ { type, url }, ... ] }
    if (!data || data.status === false) {
        m.limit = 0
        return m.reply(
            '❌ Gagal download!\n\n' +
            (data?.message || data?.error || 'Link mungkin private, expired, atau tidak valid.') +
            '\n\n✅ Limit kamu tidak jadi berkurang.'
        )
    }

    const mediaList = data.data || []
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
        m.limit = 0
        return m.reply(
            '❌ Tidak ada media ditemukan.\n\n' +
            '✅ Limit kamu tidak jadi berkurang.'
        )
    }

    const caption =
        `📸 *Instagram Downloader*\n\n` +
        `_Powered by ShiraoriBOT_`

    try {
        let sent = 0
        for (const item of mediaList) {
            const itemUrl  = item.url
            const itemType = (item.type || '').toLowerCase()
            if (!itemUrl) continue

            const isVideo = itemType === 'mp4' || itemType === 'video' || /\.mp4/i.test(itemUrl)

            await conn.sendMessage(
                m.chat,
                isVideo
                    ? { video: { url: itemUrl }, caption: sent === 0 ? caption : '', mimetype: 'video/mp4' }
                    : { image: { url: itemUrl }, caption: sent === 0 ? caption : '' },
                { quoted: m }
            )
            sent++
        }

        if (sent === 0) {
            m.limit = 0
            return m.reply(
                '❌ Gagal kirim media, URL kosong.\n\n' +
                '✅ Limit kamu tidak jadi berkurang.'
            )
        }

    } catch (e) {
        console.error('[instagram] send error:', e.message)
        m.limit = 0
        const fallbackUrl = mediaList?.[0]?.url || null
        return m.reply(
            `⚠️ Gagal kirim file.\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n\n` +
            (fallbackUrl ? `📥 *Link Media:*\n${fallbackUrl}` : `_Error: ${e.message}_`)
        )
    }
}

handler.help     = ['ig <url>', 'instagram <url>']
handler.tags     = ['downloader']
handler.command  = /^(instagram|ig|igdl|reels?)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.exp      = 3
handler.limit    = 5
handler.register = true

module.exports = handler
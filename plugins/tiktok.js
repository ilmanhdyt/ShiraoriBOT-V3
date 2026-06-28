const fetch    = require('node-fetch')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('../lib/baileys-compat')

function pickFirstUrl(val) {
    if (!val) return null
    if (typeof val === 'string') {
        const parts = val.split(/,(?=https?:\/\/)/)
        return parts[0].trim() || null
    }
    if (Array.isArray(val)) return val[0] || null
    return null
}

// Ambil array URL gambar dari response API (TikTok Slides)
// FIX: API return beberapa format per gambar (jpeg/webp/webp) dalam array slides[]
// Deduplicate berdasarkan path URL (sebelum ?) bukan full URL
// karena URL yang sama bisa punya query string berbeda tapi gambar sama
function deduplicateByPath(urls) {
    const seen = new Set()
    const result = []
    for (const url of urls) {
        if (!url) continue
        try {
            // Ambil path tanpa query string sebagai key unik
            const path = url.split('?')[0]
            // Prefer jpeg over webp — ambil yang pertama muncul per path prefix
            // Path TikTok: .../photomode-sg/HASH~tplv-...
            // Gambar berbeda punya HASH berbeda, format berbeda punya ekstensi berbeda
            const hashMatch = path.match(/\/([a-f0-9]{20,})[~_]/)
            const key = hashMatch ? hashMatch[1] : path
            if (!seen.has(key)) {
                seen.add(key)
                result.push(url)
            }
        } catch (_) {
            if (!seen.has(url)) {
                seen.add(url)
                result.push(url)
            }
        }
    }
    return result
}

function pickSlideImages(r) {
    const candidates = [
        r.images, r.image_list, r.slides, r.photos, r.image, r.Images, r.imageList
    ]
    for (const c of candidates) {
        if (!c) continue
        if (Array.isArray(c) && typeof c[0] === 'string' && c[0].startsWith('http')) {
            return deduplicateByPath(c)
        }
        if (Array.isArray(c) && typeof c[0] === 'object') {
            const urls = c.map(item =>
                item?.url || item?.download_url ||
                item?.urlList?.[0] || item?.url_list?.[0] ||
                item?.playAddr || null
            ).filter(Boolean)
            if (urls.length) return deduplicateByPath(urls)
        }
    }
    return []
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
            method : 'GET',
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

    const r        = data.result || {}

    const author   = r.username  || r.author   || ''
    const title    = r.title     || r.desc      || ''
    const duration = r.duration  || ''
    const views    = r.stats?.views || r.views  || ''
    const likes    = r.stats?.likes || r.likes  || ''
    const audioUrl = pickFirstUrl(r.music || r.audio || null)

    // ── Deteksi tipe: Slide atau Video ────────────────────
    const slideImages = pickSlideImages(r)
    const isSlide     = slideImages.length > 0
    const videoUrl    = !isSlide
        ? pickFirstUrl(r.video_nowm || r.nowm || r.video || r.play || r.wm || null)
        : null

    if (!isSlide && !videoUrl) {
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
        `${isSlide ? '📸 *TikTok Slides*' : '🎵 *TikTok Downloader*'}\n\n` +
        (author   ? `👤 ${author}\n`                             : '') +
        (title    ? `📝 ${title.slice(0, 120)}\n`               : '') +
        (duration ? `⏱️ Durasi: ${duration}\n`                  : '') +
        ((views || likes) ? `📊 View: ${views} | Like: ${likes}\n` : '') +
        `\n_Powered by ShiraoriBOT_`

    try {
        if (isSlide) {
            // ── CAROUSEL (swipeable cards) ──────────────────────────
            const cards = []
            const urls = [...new Set(slideImages)].slice(0, 10) // Limit 10 cards max
            
            for (let i = 0; i < urls.length; i++) {
                try {
                    const media = await prepareWAMessageMedia(
                        { image: { url: urls[i] } },
                        { upload: conn.waUploadToServer }
                    )
                    cards.push({
                        image: media.imageMessage,
                        body: `📸 Slide ${i + 1}/${urls.length}`,
                        buttons: [
                            { type: 'quick_reply', id: `tiktok_slide_${i}`, label: `📥 Gambar ${i + 1}` }
                        ]
                    })
                } catch (e) {
                    console.error(`[tiktok] gagal upload slide ${i + 1}:`, e.message)
                }
            }

            if (cards.length === 0) {
                m.limit = 0
                return m.reply(
                    '❌ Gagal memproses slide.\n\n' +
                    '✅ Limit kamu tidak jadi berkurang.\n\n' +
                    '📋 URL slide:\n' + slideImages.slice(0, 3).join('\n')
                )
            }

            await conn.sendCarousel(m.chat, {
                body: caption,
                footer: 'Geser untuk melihat slide →',
                cards
            }, { quoted: m })

            // Audio terpisah jika ada
            if (audioUrl) {
                await conn.sendMessage(m.chat, {
                    audio   : { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt     : false,
                }, { quoted: m }).catch(() => {})
            }

        } else {
            // ── VIDEO BIASA ────────────────────────────────
            await conn.sendMessage(m.chat, {
                video   : { url: videoUrl },
                caption,
                mimetype: 'video/mp4',
            }, { quoted: m })

            if (audioUrl) {
                await conn.sendMessage(m.chat, {
                    audio   : { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt     : false,
                }, { quoted: m })
            }
        }

    } catch (e) {
        console.error('[tiktok] send error:', e.message)
        m.limit = 0

        if (isSlide) {
            return m.reply(
                `⚠️ Gagal kirim slide.\n\n` +
                `✅ Limit kamu tidak jadi berkurang.\n\n` +
                `📥 *Link Gambar:*\n` +
                slideImages.slice(0, 5).map((u, i) => `${i + 1}. ${u}`).join('\n')
            )
        }

        return m.reply(
            `⚠️ Gagal kirim file.\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n\n` +
            `📥 *Link Video:*\n${videoUrl}\n\n` +
            (audioUrl ? `🎵 *Link Audio:*\n${audioUrl}` : '')
        )
    }
}

handler.help     = ['tiktok <url>']
handler.tags     = ['downloader']
handler.command  = /^(tiktok|tt|tikdl)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.exp      = 3
handler.limit    = 2
handler.register = true

module.exports = handler
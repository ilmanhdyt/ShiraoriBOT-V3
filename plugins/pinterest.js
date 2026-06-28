const fetch = require('node-fetch')

// ════════════════════════════════════════════════════════════
// PINTEREST SEARCH — ShiraoriBOT
// Command: .pinterest <query> [jumlah]
// API: https://bintangapi.full.diskon.cloud/api/search/pinterest?q=
// ════════════════════════════════════════════════════════════

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `🔍 *Pinterest Search*\n\n` +
        `Cara pakai:\n` +
        `*${usedPrefix}pinterest* <kata kunci>\n` +
        `*${usedPrefix}pinterest* <kata kunci> <jumlah>\n\n` +
        `Contoh:\n` +
        `▸ *${usedPrefix}pinterest* rimuru tempest\n` +
        `▸ *${usedPrefix}pinterest* anime wallpaper 5\n\n` +
        `_Jumlah maksimal: 10 gambar_`
    )

    // Parse jumlah dari akhir teks (opsional)
    const parts = text.trim().split(' ')
    let jumlah = 3
    let query = text.trim()

    const lastWord = parts[parts.length - 1]
    if (/^\d+$/.test(lastWord)) {
        jumlah = Math.min(Math.max(parseInt(lastWord), 1), 10)
        query = parts.slice(0, -1).join(' ')
    }

    if (!query) return m.reply(`❌ Kata kunci tidak boleh kosong!`)

    await m.reply(`🔍 _Mencari gambar "${query}" di Pinterest..._`)

    let data
    try {
        const apiUrl = `https://bintangapi.full.diskon.cloud/api/search/pinterest?q=${encodeURIComponent(query)}`
        const res = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 30000
        })

        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
    } catch (e) {
        console.error('[pinterest] fetch error:', e.message)
        m.limit = 0
        return m.reply(
            `⚠️ *Gagal menghubungi server Pinterest.*\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n` +
            `🔄 Coba lagi beberapa saat nanti.\n\n` +
            `_Error: ${e.message}_`
        )
    }

    if (!data?.status || !Array.isArray(data.result) || data.result.length === 0) {
        m.limit = 0
        return m.reply(
            `❌ *Tidak ada hasil untuk "${query}"*\n\n` +
            `✅ Limit kamu tidak jadi berkurang.\n` +
            `💡 Coba gunakan kata kunci yang berbeda.`
        )
    }

    // Ambil hasil secara acak agar tidak selalu sama
    const shuffled = data.result.sort(() => Math.random() - 0.5)
    const results = shuffled.slice(0, jumlah)

    // ── Kirim hasil ──────────────────────────────────────
    if (results.length === 1) {
        // Satu gambar → kirim biasa
        const item = results[0]
        const imageUrl = item.images_url
        if (!imageUrl) return m.reply('❌ Gambar tidak tersedia.')
        const caption = buildCaption(item, 1, 1, usedPrefix)
        try {
            await conn.sendMessage(m.chat, {
                image: { url: imageUrl },
                caption: `📌 *Pinterest Search*\n🔍 Query: ${query}\n━━━━━━━━━━━━━━━━━━━━\n\n${caption}`,
                mentions: [m.sender]
            }, { quoted: m })
        } catch (e) {
            console.error('[pinterest] gagal kirim gambar:', e.message)
            await m.reply(`📎 *Hasil Pinterest*\n${caption}\n\n🔗 ${imageUrl}`)
        }
        return
    }

    // Lebih dari 1 gambar → kirim sebagai Carousel
    const { prepareWAMessageMedia } = require('../lib/baileys-compat')

    await m.reply(
        `📌 *Pinterest Search*\n` +
        `🔍 Query  : ${query}\n` +
        `📸 Hasil  : ${results.length} gambar\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_Memproses carousel, mohon tunggu..._`
    )

    const cards = []
    for (let i = 0; i < results.length; i++) {
        const item = results[i]
        const imageUrl = item.images_url
        if (!imageUrl) continue

        try {
            // Upload gambar ke server WA
            const media = await prepareWAMessageMedia(
                { image: { url: imageUrl } },
                { upload: conn.waUploadToServer }
            )

            // Bangun caption singkat untuk body kartu
            let cardBody = `📌 ${i + 1}/${results.length}`
            if (item.grid_title) cardBody += ` — ${item.grid_title}`
            if (item.pinner?.full_name) cardBody += `\n👤 ${item.pinner.full_name}`
            if (item.description?.trim()) {
                let desc = item.description.trim().replace(/\n+/g, ' ')
                if (desc.length > 80) desc = desc.substring(0, 80) + '...'
                cardBody += `\n💬 ${desc}`
            }

            // Tombol per kartu
            const buttons = []
            if (item.pin && item.pin !== '-') {
                buttons.push({ type: 'cta_url', label: '🔗 Buka di Pinterest', url: item.pin })
            }
            buttons.push({ type: 'quick_reply', id: `pin_${i}`, label: `📥 Gambar ${i + 1}` })

            cards.push({
                image: media.imageMessage,
                body: cardBody,
                buttons
            })
        } catch (e) {
            console.error(`[pinterest] gagal upload gambar ${i + 1}:`, e.message)
        }

        // Delay kecil antar upload agar tidak rate-limit
        if (i < results.length - 1) await sleep(300)
    }

    if (cards.length === 0) {
        m.limit = 0
        return m.reply('❌ Semua gambar gagal diproses.\n✅ Limit tidak berkurang.')
    }

    try {
        await conn.sendCarousel(m.chat, {
            body: `📌 *Pinterest — "${query}"*\n📸 ${cards.length} gambar ditemukan`,
            footer: 'Geser untuk melihat lebih banyak →',
            cards
        }, { quoted: m })
    } catch (e) {
        console.error('[pinterest] gagal kirim carousel:', e.message)
        // Fallback: kirim satu per satu
        for (let i = 0; i < results.length; i++) {
            const item = results[i]
            if (!item.images_url) continue
            try {
                await conn.sendMessage(m.chat, {
                    image: { url: item.images_url },
                    caption: buildCaption(item, i + 1, results.length, usedPrefix)
                }, { quoted: m })
            } catch (_) {}
            if (i < results.length - 1) await sleep(500)
        }
    }
}

function buildCaption(item, current, total, usedPrefix) {
    const lines = []

    lines.push(`📌 *Hasil ${current}/${total}*`)

    if (item.grid_title) lines.push(`📝 ${item.grid_title}`)
    if (item.description && item.description.trim() && item.description.trim() !== ' ') {
        // Potong deskripsi panjang
        let desc = item.description.trim().replace(/\n+/g, ' ')
        if (desc.length > 100) desc = desc.substring(0, 100) + '...'
        lines.push(`💬 ${desc}`)
    }

    if (item.pinner?.full_name) {
        lines.push(`👤 ${item.pinner.full_name}`)
    }
    if (item.board?.name) {
        lines.push(`📂 ${item.board.name}`)
    }
    if (item.created_at) {
        lines.push(`📅 ${item.created_at}`)
    }

    const likes = item.reaction_counts?.[1]
    if (likes) lines.push(`❤️ ${likes.toLocaleString('id-ID')} likes`)

    if (item.pin && item.pin !== '-') {
        lines.push(`\n🔗 ${item.pin}`)
    }

    return lines.join('\n')
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

handler.help = ['pinterest <query>', 'pinterest <query> <jumlah>']
handler.tags = ['tools', 'downloader']
handler.command = /^(pinterest|pin|pinterestdl)$/i
handler.owner = false
handler.mods = false
handler.premium = false
handler.group = false
handler.private = false
handler.admin = false
handler.botAdmin = false
handler.exp = 3
handler.limit = 3
handler.register = false

module.exports = handler
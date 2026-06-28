// plugins/iqc.js
// Buat gambar fake quoted WhatsApp message
// Usage: .iqc <teks pesan>
// API  : https://api.azbry.com/api/maker/iqc?text=...

'use strict'

const fetch = require('node-fetch')

const API_BASE = 'https://api.azbry.com/api/maker/iqc'

let handler = async (m, { conn, text }) => {
    if (!text) return m.reply(
        `📌 *Cara Pakai:*\n.iqc <teks pesan>\n\n` +
        `*Contoh:*\n.iqc Azbry-API Dikembangkan oleh FebryWesker`
    )

    const botName = global.namabot || 'ShiraoriBOT'

    // Kirim loading message
    const sent = await conn.sendMessage(m.chat, {
        text: '⏳ _Membuat IQC image..._'
    }, { quoted: m })

    // Build URL — encode teks agar aman
    const url = `${API_BASE}?text=${encodeURIComponent(text.trim())}`

    // Fetch image dari API
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
    })

    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)

    const contentType = res.headers.get('content-type') || ''

    // Pastikan response adalah gambar
    if (!contentType.startsWith('image/')) {
        // Mungkin API return JSON error
        const body = await res.text()
        let msg = 'Gagal generate IQC.'
        try {
            const json = JSON.parse(body)
            msg = json.message || json.error || msg
        } catch (_) {}
        await conn.sendMessage(m.chat, { text: `❌ ${msg}`, edit: sent.key })
        return
    }

    const imgBuf = Buffer.from(await res.arrayBuffer())
    const mime   = contentType.split(';')[0].trim() // 'image/png' atau 'image/jpeg'

    // Hapus loading message, kirim gambar
    await conn.sendMessage(m.chat, { delete: sent.key })

    await conn.sendMessage(m.chat, {
        image: imgBuf,
        caption: `💬 *IQC Generator*\n📝 _${text.trim()}_\n\n_${global.wm || botName}_`,
        mimetype: mime,
    }, { quoted: m })
}

handler.help     = ['iqc <teks>']
handler.tags     = ['maker']
handler.command  = /^iqc$/i
handler.owner    = false
handler.limit = 2
handler.register = false

module.exports = handler
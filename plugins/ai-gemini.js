const { GoogleGenerativeAI } = require('@google/generative-ai')

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!global.gemini_key) {
        return m.reply(
            `❌ *Gemini API Key belum dikonfigurasi!*\n\n` +
            `Cara setup:\n` +
            `1. Buka https://aistudio.google.com/app/apikey\n` +
            `2. Buat API key baru\n` +
            `3. Masukkan ke config.js:\n` +
            `   global.gemini_key = 'YOUR_API_KEY'`
        )
    }

    if (!text) {
        return m.reply(
            `🌟 *Gemini AI Assistant*\n\n` +
            `Contoh penggunaan:\n` +
            `${usedPrefix + command} Jelaskan tentang quantum computing\n` +
            `${usedPrefix + command} Buatkan cerita pendek\n` +
            `${usedPrefix + command} Apa perbedaan AI dan ML?`
        )
    }

    await m.reply('💭 _Gemini sedang berpikir..._')

    const maxRetry = 3
    let lastError

    for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
            const genAI = new GoogleGenerativeAI(global.gemini_key)
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

            const result   = await model.generateContent(text)
            const response = await result.response
            const answer   = response.text()

            return await m.reply(`🌟 *Gemini AI:*\n\n${answer}\n\n_Powered by Google Gemini 2.0 Flash_`)

        } catch (error) {
            lastError = error
            const msg = error.message || ''

            // API key salah → langsung stop
            if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
                return m.reply('❌ API Key tidak valid! Silakan cek kembali API key di config.js')
            }

            // Model tidak ditemukan → langsung stop
            if (msg.includes('404') || msg.includes('not found')) {
                return m.reply('❌ Model tidak ditemukan! Hubungi owner bot.')
            }

            // Rate limit (429) → tunggu lalu retry
            if (msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('RESOURCE_EXHAUSTED')) {
                // Ambil retryDelay dari pesan error Google jika ada
                let delay = 45000
                const delayMatch = msg.match(/"retryDelay":"(\d+)s"/)
                if (delayMatch) delay = (parseInt(delayMatch[1]) + 3) * 1000

                if (attempt < maxRetry) {
                    const delaySec = Math.ceil(delay / 1000)
                    await m.reply(`⏳ _Rate limit, mencoba lagi dalam ${delaySec} detik... (${attempt}/${maxRetry})_`)
                    await sleep(delay)
                    continue
                }
            }

            break
        }
    }

    // Semua retry gagal
    const errMsg = lastError?.message || ''
    if (errMsg.includes('429') || errMsg.includes('Too Many Requests') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        return m.reply(
            '⚠️ *Rate Limit Gemini API*\n\n' +
            'Bukan quota habis — terlalu banyak request dalam waktu singkat.\n\n' +
            '📌 *Free tier limit:* 15 request/menit\n' +
            'Tunggu 1-2 menit lalu coba lagi.'
        )
    }

    return m.reply(`❌ Error: ${errMsg}`)
}

handler.help    = ['gemini <pertanyaan>']
handler.tags    = ['ai']
handler.command = /^(gemini|bard)$/i
handler.limit   = true

module.exports = handler
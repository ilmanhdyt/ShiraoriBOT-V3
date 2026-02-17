/*
const { GoogleGenerativeAI } = require('@google/generative-ai')

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Cek apakah ada API key
    if (!global.gemini_key) {
        return m.reply(`❌ *Gemini API Key belum dikonfigurasi!*\n\nCara setup:\n1. Buka https://makersuite.google.com/app/apikey\n2. Buat API key baru\n3. Masukkan ke config.js:\n   global.gemini_key = 'YOUR_API_KEY'`)
    }

    if (!text) {
        return m.reply(`🌟 *Gemini AI Assistant*\n\nContoh penggunaan:\n${usedPrefix + command} Jelaskan tentang quantum computing\n${usedPrefix + command} Buatkan cerita pendek\n${usedPrefix + command} Apa perbedaan AI dan ML?`)
    }

    m.reply('💭 Gemini sedang berpikir...')

    try {
        const genAI = new GoogleGenerativeAI(global.gemini_key)
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

        const result = await model.generateContent(text)
        const response = await result.response
        const answer = response.text()

        await m.reply(`🌟 *Gemini AI Response:*\n\n${answer}\n\n_Powered by Google Gemini_`)

    } catch (error) {
        console.error('Gemini Error:', error)
        
        if (error.message.includes('API_KEY_INVALID') || error.message.includes('API key')) {
            return m.reply('❌ API Key tidak valid! Silakan cek kembali API key Anda di config.js')
        }
        
        if (error.message.includes('quota')) {
            return m.reply('❌ Quota API sudah habis! Silakan cek quota Anda.')
        }
        
        return m.reply(`❌ Error: ${error.message}`)
    }
}

handler.help = ['gemini', 'bard']
handler.tags = ['ai']
handler.command = /^(gemini|bard)$/i
handler.limit = true

module.exports = handler
*/
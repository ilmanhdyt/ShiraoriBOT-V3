
const OpenAI = require('openai')

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Cek apakah ada API key
    if (!global.openai_key) {
        return m.reply(`❌ *OpenAI API Key belum dikonfigurasi!*\n\nCara setup:\n1. Daftar di https://platform.openai.com\n2. Buat API key di https://platform.openai.com/api-keys\n3. Masukkan ke config.js:\n   global.openai_key = 'YOUR_API_KEY'`)
    }

    if (!text) {
        return m.reply(`🤖 *ChatGPT AI Assistant*\n\nContoh penggunaan:\n${usedPrefix + command} Apa itu JavaScript?\n${usedPrefix + command} Buatkan puisi tentang cinta\n${usedPrefix + command} Jelaskan tentang AI`)
    }

    m.reply('🤔 Sedang berpikir...')

    try {
        const openai = new OpenAI({
            apiKey: global.openai_key
        })

        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'Kamu adalah asisten AI yang membantu dan ramah. Jawab dengan bahasa Indonesia kecuali diminta bahasa lain.'
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            max_tokens: 1000,
            temperature: 0.7
        })

        const answer = response.choices[0].message.content

        await m.reply(`🤖 *ChatGPT Response:*\n\n${answer}\n\n_Powered by OpenAI_`)

    } catch (error) {
        console.error('ChatGPT Error:', error)
        
        if (error.message.includes('API key')) {
            return m.reply('❌ API Key tidak valid! Silakan cek kembali API key Anda di config.js')
        }
        
        if (error.message.includes('quota')) {
            return m.reply('❌ Quota API sudah habis! Silakan cek billing Anda di OpenAI.')
        }
        
        return m.reply(`❌ Error: ${error.message}`)
    }
}

handler.help = ['chatgpt', 'gpt']
handler.tags = ['ai']
handler.command = /^(chatgpt|gpt|ai)$/i
handler.limit = true

module.exports = handler

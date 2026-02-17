let handler = async (m, { conn }) => {
    try {
        // React ke perintah user dengan emoji
        await conn.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })
        
        // Check if message is quoting a sticker
        if (!m.quoted) {
            return await m.reply('❌ *Please reply to a sticker!*')
        }
        
        let q = m.quoted
        let mime = (q.msg || q).mimetype || ''
        
        // Check if quoted message is a sticker
        if (!/webp/.test(mime)) {
            return await m.reply('❌ *Please reply to a sticker!*')
        }
        
        // Send processing message
        await m.reply('⏳ *konversi stiker ke gambar...*')
        
        // Download sticker
        let media = await q.download()
        
        if (!media) {
            throw new Error('Failed to download sticker')
        }
        
        // Send as image directly
        // WhatsApp will automatically handle the webp -> png conversion
        await conn.sendMessage(m.chat, {
            image: media,
            caption: '✅ *konversi stiker ke gambar!*'
        }, { quoted: m })
        
    } catch (error) {
        console.error('To image error:', error)
        await m.reply(`❌ *Failed to convert sticker!*\n\n*Error:* ${error.message || error}`)
    }
}

handler.help = ['toimage', 'toimg']
handler.tags = ['converter']
handler.command = /^(toimage|toimg)$/i
handler.owner = true
module.exports = handler
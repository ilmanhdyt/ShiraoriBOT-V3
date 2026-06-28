let handler = async (m, { conn }) => {
    try {
        await conn.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } })

        if (!m.quoted) {
            return await m.reply('❌ *Reply ke stiker dulu!*')
        }

        const q = m.quoted
        const mime = (q.msg || q).mimetype || ''

        if (!/webp/.test(mime)) {
            return await m.reply('❌ *Yang kamu reply harus stiker!*')
        }

        await m.reply('⏳ *Mengubah stiker ke gambar...*')

        const media = await q.download()
        if (!media) {
            throw new Error('Gagal mengunduh stiker')
        }

        await conn.sendMessage(m.chat, {
            image: media,
            caption: '✅ *Berhasil mengubah stiker ke gambar!*'
        }, { quoted: m })
    } catch (error) {
        console.error('To image error:', error)
        await m.reply(`❌ *Gagal mengubah stiker ke gambar!*\n\nError: ${error.message || error}`)
    }
}

handler.help = ['toimage', 'toimg']
handler.tags = ['converter']
handler.command = /^(toimage|toimg)$/i

module.exports = handler

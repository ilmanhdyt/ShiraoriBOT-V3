/*
const axios = require('axios')

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`🎵 *TikTok Downloader*\n\nContoh:\n${usedPrefix + command} https://vt.tiktok.com/xxxxx\n${usedPrefix + command} https://www.tiktok.com/@user/video/xxxxx`)
    }

    // Validasi URL TikTok
    if (!text.match(/tiktok\.com|vt\.tiktok\.com/)) {
        return m.reply('❌ URL tidak valid! Masukkan link TikTok yang benar.')
    }

    m.reply('⏳ Sedang mengunduh video TikTok...')

    try {
        // Menggunakan API TikTok downloader (ganti dengan API pilihan Anda)
        // Alternatif 1: API TikTok Downloader gratis
        const response = await axios.get(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(text)}`)
        
        if (response.data.status !== 200 || !response.data.video) {
            throw new Error('Video tidak ditemukan atau private')
        }

        const videoData = response.data
        const videoUrl = videoData.video.noWatermark || videoData.video.watermark
        const audioUrl = videoData.music?.play_url

        // Info video
        const caption = `✅ *TikTok Downloaded*\n\n` +
                       `👤 Author: ${videoData.author?.unique_id || 'Unknown'}\n` +
                       `📝 Title: ${videoData.title || 'No title'}\n` +
                       `❤️ Likes: ${videoData.stats?.likeCount?.toLocaleString() || '0'}\n` +
                       `💬 Comments: ${videoData.stats?.commentCount?.toLocaleString() || '0'}\n` +
                       `🔁 Shares: ${videoData.stats?.shareCount?.toLocaleString() || '0'}\n\n` +
                       `_Downloaded by ${global.namabot}_`

        // Kirim video tanpa watermark
        await conn.sendMessage(m.chat, {
            video: { url: videoUrl },
            caption: caption,
            mimetype: 'video/mp4'
        }, { quoted: m })

        // Kirim audio jika tersedia
        if (audioUrl && command.includes('audio')) {
            await conn.sendMessage(m.chat, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                fileName: 'tiktok_audio.mp3'
            }, { quoted: m })
        }

    } catch (error) {
        console.error('TikTok Download Error:', error)
        
        // Coba API alternatif
        try {
            m.reply('🔄 Mencoba metode alternatif...')
            
            // API Alternatif 2
            const altResponse = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(text)}`)
            
            if (altResponse.data.code !== 0) {
                throw new Error('API alternatif gagal')
            }

            const data = altResponse.data.data
            const videoUrl = 'https://www.tikwm.com' + data.play
            
            const caption = `✅ *TikTok Downloaded*\n\n` +
                           `👤 Author: @${data.author.unique_id}\n` +
                           `📝 Title: ${data.title}\n` +
                           `❤️ Likes: ${data.digg_count?.toLocaleString()}\n` +
                           `💬 Comments: ${data.comment_count?.toLocaleString()}\n\n` +
                           `_Downloaded by ${global.namabot}_`

            await conn.sendMessage(m.chat, {
                video: { url: videoUrl },
                caption: caption,
                mimetype: 'video/mp4'
            }, { quoted: m })

        } catch (altError) {
            console.error('Alternative TikTok API Error:', altError)
            return m.reply(`❌ Gagal mengunduh video TikTok!\n\nAlasan:\n- Video mungkin private/restricted\n- URL tidak valid\n- API sedang bermasalah\n\nSilakan coba lagi atau gunakan link yang berbeda.`)
        }
    }
}

handler.help = ['tiktok', 'tt', 'ttdl']
handler.tags = ['downloader']
handler.command = /^(tiktok|tt(dl)?|tik(tok)?(audio)?)$/i
handler.limit = true

module.exports = handler
*/
/*
const ytdl = require('ytdl-core')
const yts = require('yt-search')
const fs = require('fs')

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`📺 *YouTube Downloader*\n\nContoh:\n${usedPrefix + command} https://youtube.com/watch?v=xxxxx\n${usedPrefix + command} lagu dj viral`)
    }

    m.reply('🔍 Mencari video...')

    try {
        let videoUrl = text
        
        // Jika bukan URL, search dulu
        if (!ytdl.validateURL(text)) {
            const search = await yts(text)
            if (!search.videos.length) {
                return m.reply('❌ Video tidak ditemukan!')
            }
            videoUrl = search.videos[0].url
            
            // Kirim info video
            const video = search.videos[0]
            await conn.sendMessage(m.chat, {
                text: `✅ *Video ditemukan!*\n\n` +
                      `📌 Judul: ${video.title}\n` +
                      `⏱️ Durasi: ${video.timestamp}\n` +
                      `👁️ Views: ${video.views.toLocaleString()}\n` +
                      `📅 Upload: ${video.ago}\n` +
                      `🔗 URL: ${video.url}\n\n` +
                      `⏳ Sedang mengunduh...`,
                quoted: m
            })
        }

        const info = await ytdl.getInfo(videoUrl)
        const title = info.videoDetails.title
        const duration = parseInt(info.videoDetails.lengthSeconds)

        // Cek durasi (max 10 menit untuk MP3, 5 menit untuk video)
        if (command.includes('mp3') || command.includes('audio')) {
            if (duration > 600) {
                return m.reply('❌ Durasi maksimal untuk audio adalah 10 menit!')
            }
        } else {
            if (duration > 300) {
                return m.reply('❌ Durasi maksimal untuk video adalah 5 menit!')
            }
        }

        // Download berdasarkan command
        if (command.includes('mp3') || command.includes('audio')) {
            // Download audio
            const filename = `./tmp/${Date.now()}.mp3`
            const stream = ytdl(videoUrl, {
                filter: 'audioonly',
                quality: 'highestaudio'
            })

            stream.pipe(fs.createWriteStream(filename))

            stream.on('finish', async () => {
                await conn.sendMessage(m.chat, {
                    audio: { url: filename },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`
                }, { quoted: m })

                // Hapus file temporary
                fs.unlinkSync(filename)
            })

            stream.on('error', (err) => {
                console.error(err)
                m.reply('❌ Gagal mengunduh audio!')
            })
        } else {
            // Download video
            const filename = `./tmp/${Date.now()}.mp4`
            const stream = ytdl(videoUrl, {
                filter: 'videoandaudio',
                quality: 'highestvideo'
            })

            stream.pipe(fs.createWriteStream(filename))

            stream.on('finish', async () => {
                await conn.sendMessage(m.chat, {
                    video: { url: filename },
                    mimetype: 'video/mp4',
                    fileName: `${title}.mp4`,
                    caption: `📺 *${title}*\n\n_Downloaded by ${global.namabot}_`
                }, { quoted: m })

                // Hapus file temporary
                fs.unlinkSync(filename)
            })

            stream.on('error', (err) => {
                console.error(err)
                m.reply('❌ Gagal mengunduh video!')
            })
        }

    } catch (error) {
        console.error('YouTube Download Error:', error)
        return m.reply(`❌ Error: ${error.message}\n\nPastikan URL valid dan video tidak private/restricted.`)
    }
}

handler.help = ['ytmp3', 'ytmp4', 'yt']
handler.tags = ['downloader']
handler.command = /^(yt(mp3|mp4|audio|video)?|youtube(mp3|mp4|audio|video)?)$/i
handler.limit = true

module.exports = handler
*/
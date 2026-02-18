/**
 * YouTube Downloader
 * Pakai @distube/ytdl-core (fork aktif ytdl-core) + yt-search
 * 
 * Install sekali: npm install @distube/ytdl-core
 */

const yts   = require('yt-search')
const fetch = require('node-fetch')
const fs    = require('fs')
const path  = require('path')

const TMP_DIR = path.join(__dirname, '../tmp')

// Validasi URL YouTube
function isYtUrl(url) {
    return /(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/.test(url)
}

// Ambil video ID dari URL
function getVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/)
    return match ? match[1] : null
}

// Download via @distube/ytdl-core (lebih stabil dari ytdl-core)
async function downloadWithYtdl(videoUrl, isAudio) {
    const ytdl = require('@distube/ytdl-core')
    const info  = await ytdl.getInfo(videoUrl)
    const title = info.videoDetails.title
    const duration = parseInt(info.videoDetails.lengthSeconds)

    const maxDur = isAudio ? 600 : 300
    if (duration > maxDur) throw new Error(`Durasi maksimal ${isAudio ? '10 menit (audio)' : '5 menit (video)'}!`)

    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
    const ext      = isAudio ? 'mp3' : 'mp4'
    const filename = path.join(TMP_DIR, `yt_${Date.now()}.${ext}`)

    await new Promise((resolve, reject) => {
        const stream = ytdl(videoUrl, {
            filter  : isAudio ? 'audioonly' : 'videoandaudio',
            quality : isAudio ? 'highestaudio' : 'highestvideo',
        })
        stream.pipe(fs.createWriteStream(filename))
        stream.on('end', resolve)
        stream.on('error', reject)
    })

    return { title, filename, duration }
}

// Fallback: download via cobalt API (tidak perlu install apapun)
async function downloadWithCobalt(videoUrl, isAudio) {
    const body = {
        url           : videoUrl,
        downloadMode  : isAudio ? 'audio' : 'auto',
        audioFormat   : isAudio ? 'mp3' : undefined,
        videoQuality  : '720',
    }

    const res = await fetch('https://api.cobalt.tools/dl', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body   : JSON.stringify(body),
        timeout: 30000,
    })

    if (!res.ok) throw new Error(`Cobalt API error: ${res.status}`)
    const data = await res.json()

    if (data.status === 'error') throw new Error(data.error?.code || 'Cobalt error')
    if (!data.url) throw new Error('Cobalt: URL tidak tersedia')

    // Download file dari URL cobalt
    const dlRes = await fetch(data.url, { timeout: 60000 })
    if (!dlRes.ok) throw new Error('Gagal download file dari cobalt')

    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })
    const ext      = isAudio ? 'mp3' : 'mp4'
    const filename = path.join(TMP_DIR, `yt_${Date.now()}.${ext}`)
    const buffer   = await dlRes.buffer()
    fs.writeFileSync(filename, buffer)

    // Coba ambil judul via yt-search
    let title = 'Video YouTube'
    try {
        const vidId = getVideoId(videoUrl)
        if (vidId) {
            const r = await yts({ videoId: vidId })
            if (r && r.title) title = r.title
        }
    } catch (_) {}

    return { title, filename }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `📺 *YouTube Downloader*\n\n` +
        `Contoh:\n` +
        `${usedPrefix}ytmp3 https://youtu.be/xxxxx\n` +
        `${usedPrefix}ytmp4 https://youtu.be/xxxxx\n` +
        `${usedPrefix}ytmp3 nama lagu`
    )

    const isAudio = /mp3|audio/i.test(command)
    await m.reply(`🔍 _Mencari ${isAudio ? 'audio' : 'video'}..._`)

    let videoUrl = text

    // Kalau bukan URL → search dulu
    if (!isYtUrl(text)) {
        try {
            const search = await yts(text)
            if (!search.videos.length) return m.reply('❌ Video tidak ditemukan!')
            const video = search.videos[0]
            videoUrl = video.url
            await m.reply(
                `✅ *Video ditemukan!*\n\n` +
                `📌 *${video.title}*\n` +
                `⏱️ Durasi : ${video.timestamp}\n` +
                `👁️ Views  : ${video.views?.toLocaleString() || '-'}\n` +
                `🔗 ${video.url}\n\n` +
                `⏳ _Sedang mengunduh..._`
            )
        } catch (e) {
            return m.reply('❌ Gagal mencari video: ' + e.message)
        }
    } else {
        await m.reply('⏳ _Sedang mengunduh..._')
    }

    let result = null
    let method = ''

    // Coba @distube/ytdl-core dulu
    try {
        result = await downloadWithYtdl(videoUrl, isAudio)
        method = '@distube/ytdl-core'
    } catch (e1) {
        console.log('[YT] ytdl gagal:', e1.message, '→ coba cobalt...')
        // Fallback ke cobalt
        try {
            result = await downloadWithCobalt(videoUrl, isAudio)
            method = 'cobalt'
        } catch (e2) {
            console.error('[YT] cobalt juga gagal:', e2.message)
            return m.reply(
                `❌ *Gagal mengunduh!*\n\n` +
                `Kemungkinan penyebab:\n` +
                `• Video private atau restricted\n` +
                `• Video terlalu panjang\n` +
                `• Koneksi bermasalah\n\n` +
                `Error: ${e2.message}`
            )
        }
    }

    // Kirim file
    try {
        const { title, filename } = result
        const fileBuffer = fs.readFileSync(filename)

        if (isAudio) {
            await conn.sendMessage(m.chat, {
                audio   : fileBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${title}.mp3`,
                ptt     : false,
            }, { quoted: m })
        } else {
            await conn.sendMessage(m.chat, {
                video  : fileBuffer,
                mimetype: 'video/mp4',
                fileName: `${title}.mp4`,
                caption : `📺 *${title}*\n\n_Downloaded by ${global.namabot || 'Bot'}_`,
            }, { quoted: m })
        }

        // Hapus file temp
        try { fs.unlinkSync(filename) } catch (_) {}

    } catch (e) {
        return m.reply('❌ Gagal mengirim file: ' + e.message)
    }
}

handler.help    = ['ytmp3 <url/judul>', 'ytmp4 <url/judul>', 'yt']
handler.tags    = ['downloader']
handler.command = /^(yt(mp3|mp4|audio|video)?|youtube(mp3|mp4)?)$/i
handler.limit   = true

module.exports = handler
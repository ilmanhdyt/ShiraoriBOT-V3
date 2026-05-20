const fetch = require('node-fetch')

const API_BASE = 'https://api.lexcode.biz.id/api/tools/ssweb'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw `❌ Masukkan URL website!\n\n*Cara pakai:*\n${usedPrefix}${command} <url>\n${usedPrefix}${command} <url> full\n${usedPrefix}${command} <url> <width> <height>\n\n*Contoh:*\n${usedPrefix}${command} https://github.com\n${usedPrefix}${command} https://google.com full\n${usedPrefix}${command} https://youtube.com 1920 1080`

    const args = text.trim().split(/\s+/)
    let url = args[0]
    let width = ''
    let height = ''
    let fullPage = 'false'
    let scale = '1'

    if (!/^https?:\/\//i.test(url)) url = 'https://' + url

    try { new URL(url) } catch {
        throw `❌ URL tidak valid!\nPastikan URL dimulai dengan https://\n\nContoh: *${usedPrefix}${command} https://google.com*`
    }

    if (args[1]) {
        if (/^full$/i.test(args[1])) {
            fullPage = 'true'
        } else if (!isNaN(args[1])) {
            width = args[1]
            height = args[2] && !isNaN(args[2]) ? args[2] : ''
        }
    }

    await conn.sendMessage(m.chat, { react: { text: '📸', key: m.key } })

    const params = new URLSearchParams({ url })
    if (width) params.set('width', width)
    if (height) params.set('height', height)
    if (fullPage === 'true') params.set('fullPage', fullPage)
    if (scale !== '1') params.set('scale', scale)

    const apiUrl = `${API_BASE}?${params.toString()}`

    let result
    try {
        const res = await fetch(apiUrl, { timeout: 30000 })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        result = await res.json()
    } catch (e) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        throw `❌ Gagal menghubungi API!\nError: ${e.message}\n\nCoba lagi beberapa saat.`
    }

    if (!result?.success || !result?.result) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        throw `❌ API gagal mengambil screenshot!\n\nPastikan:\n• URL bisa diakses publik\n• Website tidak memblokir bot\n• URL dimulai dengan https://`
    }

    let imgBuf
    try {
        const imgRes = await fetch(result.result, { timeout: 30000 })
        if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`)
        imgBuf = await imgRes.buffer()
    } catch (e) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        throw `❌ Gagal mengunduh hasil screenshot!\nError: ${e.message}`
    }

    const w = result.settings?.width || width || 1280
    const h = result.settings?.height || height || 720
    const isFull = result.settings?.fullPage || false
    const caption =
        `📸 *Screenshot Website*\n\n` +
        `🌐 URL      : ${url}\n` +
        `📐 Resolusi : ${w} × ${h}\n` +
        `📄 Mode     : ${isFull ? 'Full Page' : 'Viewport'}\n` +
        `🔖 Cache ID : ${result.cacheId || '-'}\n\n` +
        `_Powered by LexCode API_`

    try {
        await conn.sendMessage(m.chat, {
            image: imgBuf,
            caption,
            mimetype: 'image/jpeg',
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (e) {
        console.error('[SSWEB] Gagal kirim:', e.message)
        throw `❌ Gagal mengirim screenshot!\nError: ${e.message}`
    }
}

handler.help = ['ssweb <url>', 'ssweb <url> full', 'ssweb <url> <width> <height>']
handler.tags = ['tools']
handler.command = /^(ssweb|ss|screenshot|screenshotweb)$/i

handler.owner = false
handler.mods = false
handler.premium = false
handler.group = false
handler.private = false
handler.admin = false
handler.botAdmin = false
handler.fail = null

module.exports = handler

const _file = require.resolve(__filename)
const _fs = require('fs')
const _chalk = (() => { try { return require('chalk') } catch { return { redBright: s => s } } })()
_fs.watchFile(_file, () => {
    _fs.unwatchFile(_file)
    console.log(_chalk.redBright(`Update 'ssweb.js'`))
    delete require.cache[_file]
    if (global.reloadHandler) global.reloadHandler()
})

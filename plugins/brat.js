/**
 * BRAT STIKER GENERATOR
 * Mereplikasi style dari github.com/gyurmatag/realtime-brat-generator
 * Style: lowercase, font tipis (Liberation Sans), center, blur khas brat
 *
 * Butuh: ImageMagick
 * Windows: https://imagemagick.org/script/download.php#windows
 *   → Centang "Add to system PATH" saat install → Restart PC
 */

const { exec }  = require('child_process')
const fs        = require('fs')
const path      = require('path')
const util      = require('util')
const execAsync = util.promisify(exec)

const FONT_PATH = path.join(__dirname, '../src/font/LiberationSans-Regular.ttf')
const TMP_DIR   = path.join(__dirname, '../tmp')
const IS_WIN    = process.platform === 'win32'

let _cmd = null
async function getMagickCmd() {
    if (_cmd) return _cmd
    for (const c of ['magick', 'magick convert', 'convert']) {
        try { await execAsync(`${c} --version`); _cmd = c; return c } catch {}
    }
    throw new Error(
        'ImageMagick tidak ditemukan!\n' +
        'Download: https://imagemagick.org/script/download.php#windows\n' +
        'Centang "Add to system PATH" lalu restart PC.'
    )
}

function wordWrap(text, maxCPL) {
    const words = text.split(' ')
    const lines = []
    let cur = ''
    for (const w of words) {
        const t = cur ? cur + ' ' + w : w
        if (t.length > maxCPL && cur) { lines.push(cur); cur = w }
        else cur = t
    }
    if (cur) lines.push(cur)
    return lines
}

function calcLayout(len) {
    if (len <= 6)  return { fontSize: 110, maxCPL: 8  }
    if (len <= 12) return { fontSize: 95,  maxCPL: 9  }
    if (len <= 20) return { fontSize: 82,  maxCPL: 11 }
    if (len <= 30) return { fontSize: 74,  maxCPL: 12 }
    if (len <= 45) return { fontSize: 64,  maxCPL: 14 }
    if (len <= 60) return { fontSize: 54,  maxCPL: 16 }
    if (len <= 80) return { fontSize: 46,  maxCPL: 18 }
    return             { fontSize: 38,  maxCPL: 22 }
}

function q(str) {
    if (IS_WIN) return '"' + str.replace(/"/g, '\\"') + '"'
    return "'" + str.replace(/'/g, "'\"'\"'") + "'"
}

function escText(str) {
    if (IS_WIN) return str.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n')
    return str.replace(/'/g,"'\"'\"'").replace(/\n/g,'\\n')
}

async function generateBratImage(rawText) {
    const lower   = rawText.toLowerCase()
    const layout  = calcLayout(lower.length)
    const fontSize = layout.fontSize
    const maxCPL   = layout.maxCPL
    const lines   = wordWrap(lower, maxCPL)
    const wrapped = lines.join('\n')

    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

    const ts     = Date.now()
    const layerP = path.join(TMP_DIR, 'bl_' + ts + '.png')
    const blurP  = path.join(TMP_DIR, 'bb_' + ts + '.png')
    const outP   = path.join(TMP_DIR, 'bo_' + ts + '.png')

    const cleanup = () => {
        for (const f of [layerP, blurP, outP]) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch (e) {}
        }
    }

    const M = await getMagickCmd()

    try {
        await execAsync(
            M + ' -size 512x512 xc:none -font ' + q(FONT_PATH) +
            ' -pointsize ' + fontSize +
            ' -fill "#111111" -gravity Center -annotate 0 "' + escText(wrapped) + '" ' + q(layerP)
        )
        await execAsync(M + ' ' + q(layerP) + ' -blur 0x3 ' + q(blurP))
        await execAsync(M + ' -size 512x512 xc:white ' + q(blurP) + ' -composite ' + q(outP))

        return fs.readFileSync(outP)
    } finally {
        cleanup()
    }
}

let handler = async (m, { conn, text }) => {
    if (!text) return m.reply('Masukkan teks!\nContoh: *.brat aku mau seperti ini hasilnya*')

    await conn.sendMessage(m.chat, { react: { text: '🤍', key: m.key } })

    try {
        const imgBuffer = await generateBratImage(text)
        const WSF       = require('wa-sticker-formatter')
        const stiker    = await new WSF.Sticker(imgBuffer, {
            type      : 'full',
            pack      : global.packname || 'BratBot',
            author    : global.author   || 'Bot',
            categories: ['🤍'],
        }).build()

        if (stiker) await conn.sendFile(m.chat, stiker, 'brat.webp', '', m)
        else throw new Error('Build stiker gagal')
    } catch (e) {
        console.error('[BRAT ERROR]', e)
        m.reply('❌ Gagal: ' + (e.message || e))
    }
}

handler.help    = ['brat <teks>']
handler.tags    = ['sticker']
handler.command = /^(brat)$/i
handler.owner = false
module.exports  = handler
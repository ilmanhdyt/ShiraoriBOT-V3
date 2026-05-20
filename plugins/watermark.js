// watermark.js - Ubah watermark/creator stiker
// Cara pakai:
//   Reply stiker → .watermark PackName | Author
//   Reply stiker → .setwm PackName | Author
//   Contoh: .watermark ShiraoriBOT | Ilman

const fs      = require('fs')
const os      = require('os')
const path    = require('path')
const Crypto  = require('crypto')
const webp    = require('node-webpmux')

async function setWatermark(stickerBuffer, packname, author) {
    const tmpIn  = path.join(os.tmpdir(), Crypto.randomBytes(6).toString('hex') + '.webp')
    const tmpOut = path.join(os.tmpdir(), Crypto.randomBytes(6).toString('hex') + '.webp')

    fs.writeFileSync(tmpIn, stickerBuffer)

    const json = {
        'sticker-pack-id'        : 'https://github.com/ilmanhdyt/shirotermux',
        'sticker-pack-name'      : packname,
        'sticker-pack-publisher' : author,
        'emojis'                 : ['🤖']
    }

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ])

    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8')
    const exif     = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)

    const img = new webp.Image()
    await img.load(tmpIn)
    fs.unlinkSync(tmpIn)
    img.exif = exif
    await img.save(tmpOut)

    const result = fs.readFileSync(tmpOut)
    try { fs.unlinkSync(tmpOut) } catch (_) {}

    return result
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Cek apakah reply ke stiker
    const quoted = m.quoted
    if (!quoted) throw `❌ Reply ke stiker dulu!\n\nContoh:\n*${usedPrefix}${command} NamaBot | NamaKamu*`

    const mime = (quoted.msg || quoted).mimetype || ''
    if (!mime.includes('webp')) throw `❌ Yang di-reply bukan stiker!\n\nReply ke stiker lalu ketik:\n*${usedPrefix}${command} NamaBot | NamaKamu*`

    if (!text) throw (
        `❌ Masukkan nama watermark!\n\n` +
        `Format: *${usedPrefix}${command} PackName | Author*\n\n` +
        `Contoh:\n` +
        `*${usedPrefix}${command} ShiraoriBOT | Ilman*\n` +
        `*${usedPrefix}${command} My Sticker | Nama Kamu*`
    )

    // Parse packname dan author
    let packname, author
    if (text.includes('|')) {
        const parts = text.split('|')
        packname = parts[0].trim()
        author   = parts[1].trim()
    } else {
        packname = text.trim()
        author   = m.pushName || 'ShiraoriBOT'
    }

    if (!packname) throw '❌ PackName tidak boleh kosong!'

    await m.reply(global.wait || '_Sedang memproses..._')

    try {
        // Download stiker yang di-reply
        const stickerBuffer = await quoted.download()

        // Set watermark baru
        const result = await setWatermark(stickerBuffer, packname, author)

        // Kirim stiker dengan watermark baru
        await conn.sendMessage(m.chat, { sticker: result }, { quoted: m })

    } catch (e) {
        console.log('[WATERMARK] error:', e.message)
        throw '❌ Gagal mengubah watermark: ' + e.message
    }
}

handler.help    = ['watermark <packname> | <author>']
handler.tags    = ['tools', 'sticker']
handler.command = /^(watermark|setwm|wm)$/i
handler.prems = true
module.exports = handler
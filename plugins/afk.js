// plugins/afk.js

let fs   = require('fs')
let path = require('path')
const { numToJid, jidToNum, getDbUser } = require('../lib/jidUtils')
let cachedMenuImage

async function getMenuImage() {
    if (cachedMenuImage !== undefined) return cachedMenuImage
    const menuBg = path.join(__dirname, '../media/menu_bg.jpg')
    if (fs.existsSync(menuBg)) {
        cachedMenuImage = fs.readFileSync(menuBg)
        return cachedMenuImage
    }
    const locals = [
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of locals) {
        if (fs.existsSync(p)) {
            cachedMenuImage = fs.readFileSync(p)
            return cachedMenuImage
        }
    }
    cachedMenuImage = null
    return cachedMenuImage
}

let handler = async (m, { conn, text }) => {
    const botName = global.namabot || 'ShiraoriBOT'
    const thumbnail = await getMenuImage()

    let user = getDbUser(m.sender)
    if (!user) return m.reply('❌ Kamu belum terdaftar!')

    user.afk = +new Date()
    user.afkReason = text || ''

    const caption = `😴 *${conn.getName(m.sender)}* sekarang AFK${text ? '\n📝 Alasan: ' + text : ''}`

    if (thumbnail) {
        await conn.sendMessage(m.chat, {
            image: thumbnail,
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    title: botName,
                    body: 'Sedang AFK',
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    thumbnail: thumbnail
                }
            }
        }, { quoted: m })
    } else {
        await m.reply(caption)
    }
}

handler.help    = ['afk [alasan]']
handler.tags    = ['main']
handler.command = /^(afk)$/i

module.exports = handler

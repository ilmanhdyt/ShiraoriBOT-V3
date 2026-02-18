/**
* jangan ganti ya kakak kakak sekalian
* ini cuma buat ninggalin credit gw doang :)
**/

const fs   = require('fs')
const path = require('path')

let handler = async (m) => {
    const esce = `*Source Code*\n\nBot ini menggunakan script dari:\nhttps://github.com/ilmanhdyt/ShiraoriBOT-v3`

    // Ambil gambar sama seperti menu
    const imgPath = path.join(__dirname, '../media/menu_bg.jpg')
    const fallback = path.join(__dirname, '../media/shiraori.jpg')

    let imgBuf = null
    if (fs.existsSync(imgPath))       imgBuf = fs.readFileSync(imgPath)
    else if (fs.existsSync(fallback)) imgBuf = fs.readFileSync(fallback)

    if (imgBuf) {
        return conn.sendMessage(m.chat, {
            image: imgBuf,
            caption: esce,
            mimetype: 'image/jpeg'
        }, { quoted: m })
    }

    return conn.reply(m.chat, esce, m)
}

handler.help    = ['sc', 'sourcecode']
handler.tags    = ['info']
handler.command = /^(sc|sourcecode)$/i
module.exports  = handler

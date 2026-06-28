let regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i
let fetch = require('node-fetch')

let handler = async (m, { args, usedPrefix, command }) => {
    if (!args[0]) throw `Link githubnya mana?\nContoh: *${usedPrefix + command} https://github.com/ilmanhdyt/ShiraoriBOT*`
    if (!regex.test(args[0])) throw 'Link tidak valid! Pastikan link dari github.com'

    let [, user, repo] = args[0].match(regex) || []
    repo = repo.replace(/.git$/, '')

    let url = `https://api.github.com/repos/${user}/${repo}/zipball`

    // Cek repo dulu via API
    let check = await fetch(`https://api.github.com/repos/${user}/${repo}`)
    if (!check.ok) throw `Repository *${user}/${repo}* tidak ditemukan!`

    let head = await fetch(url, { method: 'HEAD' })
    if (!head.ok) throw `Gagal mengakses repository *${user}/${repo}*!`

    let disposition = head.headers.get('content-disposition') || ''
    let match = disposition.match(/attachment; filename=(.+)/)
    let filename = match ? match[1] : `${user}-${repo}.zip`

    await m.reply(`⏳ *Mohon tunggu, sedang mengirim repository...*\n📦 ${user}/${repo}`)
    await conn.sendFile(m.chat, url, filename, null, m)
}

handler.help = ['gitclone <url>']
handler.tags = ['downloader']
handler.command = /^gitclone$/i
handler.limit = true
module.exports = handler
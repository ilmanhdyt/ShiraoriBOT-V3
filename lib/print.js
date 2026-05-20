// lib/print.js — atexovi-baileys compatible
// WAMessageStubType diambil dari atexovi-baileys, bukan @adiwajshing/baileys
const _bp = require('@whiskeysockets/baileys')
const WAMessageStubType = _bp.WAMessageStubType || {}

let urlRegex = require('url-regex-safe')({ strict: false })
let PhoneNumber = require('awesome-phonenumber')
let terminalImage = global.opts && global.opts['img'] ? require('terminal-image') : ''
let chalk = require('chalk')
let fs = require('fs')

/** Safe wrapper — PhoneNumber.getNumber() bisa return undefined untuk nomor tidak valid */
function safePhoneFormat(raw) {
    try {
        const num = raw.replace('@s.whatsapp.net', '').replace('@lid', '').split(':')[0]
        if (!num || isNaN(num)) return raw
        return PhoneNumber('+' + num).getNumber('international') || ('+' + num)
    } catch (_) { return raw }
}

module.exports = async function (m, conn = { user: {} }) {
  let _name = await conn.getName(m.sender)
  let sender = safePhoneFormat(m.sender) + (_name ? ' ~' + _name : '')
  let chat = await conn.getName(m.chat)
  let img
  try {
    if (global.opts && global.opts['img'])
      img = /sticker|image/gi.test(m.mtype) ? await terminalImage.buffer(await m.download()) : false
  } catch (e) {
    console.error(e)
  }
  let filesize = (m.msg ?
    m.msg.vcard ?
      m.msg.vcard.length :
      m.msg.fileLength ?
        m.msg.fileLength.low || m.msg.fileLength :
        m.msg.axolotlSenderKeyDistributionMessage ?
          m.msg.axolotlSenderKeyDistributionMessage.length :
          m.text ?
            m.text.length :
            0
    : m.text ? m.text.length : 0) || 0
  let _senderKey = (global.jidToNum ? global.jidToNum(m.sender) : m.sender.split('@')[0].split(':')[0])
  let user = global.db?.data?.users?.[_senderKey] || null
  let me = safePhoneFormat((conn.user && conn.user.jid) || '')
  console.log(`
${chalk.redBright('%s')} ${chalk.black(chalk.bgYellow('%s'))} ${chalk.black(chalk.bgGreen('%s'))} ${chalk.magenta('%s [%s %sB]')}
${chalk.green('%s')} ${chalk.yellow('%s%s')} ${chalk.blueBright('to')} ${chalk.green('%s')} ${chalk.black(chalk.bgYellow('%s'))}
`.trim(),
    me + ' ~' + (conn.user && conn.user.name || ''),
    (m.messageTimestamp ? new Date(1000 * (m.messageTimestamp.low || m.messageTimestamp)) : new Date).toTimeString(),
    m.messageStubType ? (WAMessageStubType[m.messageStubType] || m.messageStubType) : '',
    filesize,
    filesize === 0 ? 0 : (filesize / 1009 ** Math.floor(Math.log(filesize) / Math.log(1000))).toFixed(1),
    ['', ...'KMGTP'][Math.floor(Math.log(filesize) / Math.log(1000))] || '',
    sender,
    m ? m.exp : '?',
    user ? '|' + user.exp + '|' + user.limit : '' + ('|' + (user && user.level)),
    m.chat + (chat ? ' ~' + chat : ''),
    m.mtype ? m.mtype.replace(/message$/i, '').replace('audio', m.msg && m.msg.ptt ? 'PTT' : 'audio').replace(/^./, v => v.toUpperCase()) : ''
  )
  if (img) console.log(img.trimEnd())
  if (typeof m.text === 'string' && m.text) {
    let log = m.text.replace(/\u200e+/g, '')
    let mdRegex = /(?<=(?:^|[\s\n])\S?)(?:([*_~])(.+?)\1|```((?:.||[\n\r])+?)```)(?=\S?(?:[\s\n]|$))/g
    let mdFormat = (depth = 4) => (_, type, text, monospace) => {
      let types = {
        _: 'italic',
        '*': 'bold',
        '~': 'strikethrough'
      }
      text = text || monospace
      let formatted = !types[type] || depth < 1 ? text : chalk[types[type]](text.replace(mdRegex, mdFormat(depth - 1)))
      return formatted
    }
    if (log.length < 4096)
      log = log.replace(urlRegex, (url, i, text) => {
        let end = url.length + i
        return i === 0 || end === text.length || (/^\s$/.test(text[end]) && /^\s$/.test(text[i - 1])) ? chalk.blueBright(url) : url
      })
    log = log.replace(mdRegex, mdFormat(4))
    if (m.mentionedJid) for (let user of m.mentionedJid) log = log.replace('@' + user.split`@`[0], chalk.blueBright('@' + await conn.getName(user)))
    console.log(m.error != null ? chalk.red(log) : m.isCommand ? chalk.yellow(log) : log)
  }
  if (m.messageStubParameters) console.log(m.messageStubParameters.map(jid => {
    jid = conn.decodeJid(jid)
    let name = conn.getName(jid)
    return chalk.gray(safePhoneFormat(jid) + (name ? ' ~' + name : ''))
  }).join(', '))
  if (/document/i.test(m.mtype)) console.log(`📄 ${m.msg && (m.msg.filename || m.msg.displayName) || 'Document'}`)
  else if (/ContactsArray/i.test(m.mtype)) console.log(`👨‍👩‍👧‍👦 ${' ' || ''}`)
  else if (/contact/i.test(m.mtype)) console.log(`👨 ${m.msg && m.msg.displayName || ''}`)
  else if (/audio/i.test(m.mtype)) {
    let s = m.msg && m.msg.seconds || 0
    console.log(`${m.msg && m.msg.ptt ? '🎤 (PTT ' : '🎵 ('}AUDIO) ${Math.floor(s / 60).toString().padStart(2, 0)}:${(s % 60).toString().padStart(2, 0)}`)
  }
  console.log()
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.redBright("Update 'lib/print.js'"))
  delete require.cache[file]
})

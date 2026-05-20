let fs = require('fs')
// Load .env jika ada (opsional — tidak crash jika tidak ada)
try { require('dotenv').config() } catch (_) {}

const { jidToNum, numToJid, chatKey, normalizeMentions, getDbUser, setDbUser, ensureDbUser, resolveUserIdentity, getUserKey } = require('./lib/jidUtils')

// ── Fungsi JID ↔ Nomor — tersedia global di semua plugin ──────────
global.jidToNum          = jidToNum
global.numToJid          = numToJid
global.chatKey           = chatKey
global.normalizeMentions = normalizeMentions  
global.getDbUser         = getDbUser          
global.setDbUser         = setDbUser         
global.ensureDbUser      = ensureDbUser       
global.resolveUserIdentity = resolveUserIdentity
global.getUserKey         = getUserKey

global.owner = [
    '6281351047727', '6289803135347', '174354348417270', '20143849627780'   
]
global.lokasi = 'Makassar, Indonesia'  
global.koordinat = { lat: -5.1477, lon: 119.4327 }
global.mods = [] 
global.prems = JSON.parse(fs.readFileSync('./src/premium.json'))
global.APIs = { // API Prefix
  // name: 'https://website'
  nrtm: 'https://nurutomo.herokuapp.com',
  xteam: 'https://api.xteam.xyz',
}
global.errorGroup = '120363425294318971@g.us'
global.APIKeys = { // APIKey Here
  // 'https://website': 'apikey'
  'https://api.xteam.xyz': 'apivproject',
}


global.openai_key    = process.env.OPENAI_KEY    || '' // https://platform.openai.com/api-keys
global.gemini_key    = process.env.GEMINI_KEY    || '' // https://makersuite.google.com/app/apikey
global.telegramToken  = process.env.TELEGRAM_TOKEN   || ''
global.telegramChatId = process.env.TELEGRAM_CHAT_ID || ''
// Sticker WM
global.stiker_wait = 'Stiker sedang dibuat'
global.packname = 'ShiraoriBOT Multi device'
global.author = 'Ilmanhdyt'
global.namabot = 'ShiraoriBOT'
global.fla = 'https://www6.flamingtext.com/net-fu/proxy_form.cgi?&imageoutput=true&script=runner-logo&doScale=true&scaleWidth=800&scaleHeight=500&fontsize=100&text='
global.wm = '© ShiraoriBOT-Md • Ilmanhdyt'
global.media = 'https://pin.it/tDYzLKWVI'

global.wait = '_*tunggu sedang di proses...*_'
global.eror = '_*Server Error*_'

global.dtu = 'ɪɴꜱᴛᴀɢʀᴀᴍ'
global.urlnya = "https://www.instagram.com/ilmanhdyt_"

//============= callButtons =============//
global.dtc = 'ᴄᴀʟʟ ᴏᴡɴᴇʀ'
global.phn = '+62 813-5104-7727'

//============= Games ================//
global.benar = '_*Benar✅*_'
global.salah = '_*Salah❌*_'
global.dikit = "dikit lagi, semangat ya :')"


global.multiplier = 69 // The higher, The harder levelup

global.rpg = {
  emoticon(string) {
    string = string.toLowerCase()
    let emot = {
      exp: '✉️',
      money: '💵',
      potion: '🥤',
      diamond: '💎',
      common: '📦',
      uncommon: '🎁',
      mythic: '🗳️',
      legendary: '🗃️',
      pet: '🎁',
      sampah: '🗑',
      armor: '🥼',
      sword: '⚔️',
      kayu: '🪵',
      batu: '🪨',
      string: '🕸️',
      kuda: '🐎',
      kucing: '🐈' ,
      anjing: '🐕',
      petFood: '🍖',
      gold: '👑',
      emerald: '💚'
    }
    let results = Object.keys(emot).map(v => [v, new RegExp(v, 'gi')]).filter(v => v[1].test(string))
    if (!results.length) return ''
    else return emot[results[0][0]]
  }
}


let chalk = require('chalk')
const xmldom = require('xmldom')
let file = require.resolve(__filename)
fs.watchFile(file, () => {
  fs.unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  delete require.cache[file]
  require(file)
})
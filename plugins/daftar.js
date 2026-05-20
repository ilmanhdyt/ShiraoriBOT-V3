// daftar.js - Registrasi user

const { createHash } = require('crypto')
const { jidToNum } = require('../lib/jidUtils')
const { displayForJid } = require('../lib/jidUtils')

const Reg = /\|?(.*)([.|] *?)([0-9]*)$/i

let handler = async function (m, { conn, text, usedPrefix, command }) {
    const _key = jidToNum(m.sender)
    if (!_key || !/^62\d{8,15}$/.test(_key)) {
        throw '❌ Nomor WA tidak valid / belum terdeteksi. Silakan pastikan akun sudah terhubung ke nomor WA biasa (bukan LID mentah).'
    }
    if (!global.db.data.users) global.db.data.users = {}
    let user = global.db.data.users?.[_key]

    if (!user || user._temp) {
        global.db.data.users[_key] = {
            exp: 0, limit: 10, lastclaim: 0,
            registered: false, name: m.name, age: -1, regTime: -1,
            afk: -1, afkReason: '', banned: false, warn: 0,
            level: 0, role: '👿 Lesser Demon', autolevelup: true,
            money: 0, healt: 100, potion: 10, streak: 0, lastwork: 0,
            petFood: 0, makananpet: 0, food: 0, sampah: 0, kayu: 0, batu: 0,
            string: 0, emerald: 0, diamond: 0, gold: 0, iron: 0,
            common: 0, uncommon: 0, mythic: 0, legendary: 0,
            petCount: 0, pet: null,
            kuda: 0, kudaexp: 0, kucing: 0, kucingexp: 0,
            rubah: 0, rubahexp: 0, anjing: 0, anjingexp: 0,
            kudalastfeed: 0, kucinglastfeed: 0, rubahlastfeed: 0, anjinglastfeed: 0,
            armor: 0, armordurability: 0, sword: 0, sworddurability: 0,
            pickaxe: 0, pickaxedurability: 0, fishingrod: 0, fishingroddurability: 0,
            lastadventure: 0, lastfishing: 0, lastdungeon: 0, lastduel: 0,
            lastmining: 0, lasthunt: 0, lastweekly: 0, lastmonthly: 0,
            warning: 0, jailUntil: 0
        }
        user = global.db.data.users?.[_key]
    }

    if (user.registered) throw `❌ Kamu sudah terdaftar!\nMau daftar ulang? Ketik: *${usedPrefix}unreg <SERIAL NUMBER>*`
    if (!text || !Reg.test(text)) throw `❌ Format salah!\nContoh: *${usedPrefix + command} NamaKamu.20*`

    let [, name, , age] = text.match(Reg)

    if (!name || !name.trim()) throw '❌ Nama tidak boleh kosong!'
    if (!age) throw '❌ Umur tidak boleh kosong!'
    if (!/^[a-zA-Z0-9 ]+$/.test(name.trim())) throw '❌ Nama hanya boleh huruf dan angka!'

    age = parseInt(age)
    if (isNaN(age)) throw '❌ Umur harus berupa angka!'
    if (age < 5) throw '❌ Umur terlalu kecil!'
    if (age > 60) throw '❌ Umur terlalu besar!'

    user.name = name.trim()
    user.age = age
    user.regTime = Date.now()
    user.registered = true

    const sn = createHash('md5').update(m.sender).digest('hex').toUpperCase()

    const senderRaw = m.sender
    const senderNum = _key
    const premList = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
    const isPremium = premList.includes(senderNum)

    await global.db.write()

    const LOG_GROUP = '120363426689989491@g.us'
    const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
    const ownerJid = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null

    const lidMap = global.db.data?.settings?.lidMap || {}
    const lidEntry = Object.entries(lidMap).find(([k, v]) => {
        if (v !== senderRaw) return false
        if (!k.endsWith('@lid')) return false
        const kNum = k.split('@')[0].split(':')[0]
        return kNum !== senderNum
    })
    const lidKnown = lidEntry ? lidEntry[0] : null
    const lidNum = lidKnown ? lidKnown.split('@')[0] : null

    const logMentions = [senderRaw, ...(ownerJid ? [ownerJid] : [])]
    const lidLine = lidKnown
        ? `👤 *Pemilik LID terdeteksi:* ${displayForJid(lidKnown) || lidNum}\n\nKetik: .setlid ${senderNum} ${lidNum}`
        : `🔑 *LID:* _(belum diketahui)_\n` +
          `📌 *Cara set LID:*\n` +
          `Ketik: \`.setlid ${senderNum} <angkaLID>\`\n` +
          `_LID muncul di log console saat user ini pertama kali di-tag_`

    await conn.sendMessage(LOG_GROUP, {
        text:
            `📋 *User baru daftar!*\n\n` +
            `👤 *Nama:* ${user.name}\n` +
            `🎂 *Umur:* ${user.age}\n` +
            `📱 *Nomor WA:* \`${displayForJid(senderRaw) || senderNum}\`\n` +
            `${lidLine}\n\n` +
            (ownerJid ? `👑 @${ownerJid.split('@')[0]}` : ''),
        mentions: logMentions
    }).catch(() => {})

    m.reply(`
╭─「 ✅ *REGISTRASI BERHASIL* 」
│
│  👤 *Nama:* ${user.name}
│  🎂 *Umur:* ${user.age} Tahun
│  🎖️ *Status:* ${isPremium ? '⭐ Premium' : '👤 Regular'}
│  🎁 *Hadiah:* ${isPremium ? '✅ Chat owner untuk klaim hadiah!' : '❌ Bukan user premium'}
│
│  🔑 *Serial Number:*
│  \`${sn}\`
│
│  ⚠️ Simpan SN ini untuk *unreg*!
│  Ketik *${usedPrefix}unreg <SN>* untuk unregister
│
╰─────────────────
`.trim())
}

handler.help = ['daftar', 'register'].map(v => v + ' <nama>.<umur>')
handler.tags = ['rpg', 'main']
handler.command = /^(daftar|reg(ister)?)$/i

module.exports = handler

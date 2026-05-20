const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/_autolevelup.js
// Auto level up notifikasi — teks saja (canvas dihapus, tidak butuh @napi-rs/canvas)

let handler  = m => m
let levelling = require('../lib/levelling')
const fs   = require('fs')
const path = require('path')
let cachedLevelUpImage

function getRole(level) {
    if (level >= 60) return '👑 True Demon Lord'
    if (level >= 45) return '🔱 Primordial Demon'
    if (level >= 30) return '⚔️ Demon Lord'
    if (level >= 20) return '💀 Demon Peer'
    if (level >= 12) return '🔥 Arch Demon'
    if (level >= 6)  return '😈 Greater Demon'
    return                  '👿 Lesser Demon'
}

// Progress bar teks (10 karakter)
function progressBar(current, max, size = 10) {
    const filled = Math.round((current / Math.max(max, 1)) * size)
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, size - filled))
}

handler.before = async function (m) {
    if (!m.sender) return true
    const user = getDbUser(m.sender)
    if (!user) return true
    if (!user.autolevelup) return true

    const before = user.level * 1

    // Naikan level
    while (levelling.canLevelUp(user.level, user.exp, global.multiplier)) user.level++

    // Update role setelah level up
    user.role = getRole(user.level)

    if (before === user.level) return true

    // Hitung XP range level baru
    const { min, xp } = levelling.xpRange(user.level, global.multiplier)
    const currentXP   = Math.max(user.exp - min, 0)
    const bar         = progressBar(currentXP, xp)
    const name        = this.getName(m.sender)

    try {
        // Reward ekonomi level up
        let bonusKoinMsg = ''
        if (typeof global.rewardLevelUp === 'function') {
            try {
                const koin = await global.rewardLevelUp(m.sender, user.level)
                bonusKoinMsg = `\n💵 Bonus koin: *+${Number(koin).toLocaleString('id-ID')}*`
            } catch (_) {}
        }

        if (cachedLevelUpImage === undefined) {
            const imgPath = path.join(__dirname, '../media/menu_bg.jpg')
            cachedLevelUpImage = fs.existsSync(imgPath) ? fs.readFileSync(imgPath) : null
        }
        const imgBuf = cachedLevelUpImage

        const caption =
            `🎉 *LEVEL UP!*\n\n` +
            `👤 *${name}*\n` +
            `⭐ Level: *${before}* → *${user.level}*\n` +
            `🏅 Role : *${getRole(user.level)}*\n\n` +
            `📊 EXP  : ${bar}\n` +
            `      ${currentXP.toLocaleString('id-ID')} / ${xp.toLocaleString('id-ID')} XP` +
            bonusKoinMsg

        if (imgBuf) {
            await this.sendMessage(m.chat, {
                image   : imgBuf,
                caption,
                mimetype: 'image/jpeg'
            }, { quoted: m })
        } else {
            await this.sendMessage(m.chat, { text: caption }, { quoted: m })
        }
    } catch (e) {
        console.log('[LEVELUP] error:', e.message)
        // Fallback text-only
        try {
            this.sendMessage(m.chat, {
                text:
                    `🎉 *Level Up!*\n` +
                    `⭐ Level: *${before}* → *${user.level}*\n` +
                    `🏅 Role : *${getRole(user.level)}*`
            }, { quoted: m })
        } catch (_) {}
    }

    return true
}

handler.before.filesizeLimit = 0
module.exports = handler

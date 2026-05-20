const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// role-updater.js
// Auto-update role user berdasarkan level setiap pesan masuk
// Taruh di folder plugins/

// Mapping level → role
function getRole(level) {
    if (level >= 60) return '👑 True Demon Lord'
    if (level >= 45) return '🔱 Primordial Demon'
    if (level >= 30) return '⚔️ Demon Lord'
    if (level >= 20) return '💀 Demon Peer'
    if (level >= 12) return '🔥 Arch Demon'
    if (level >= 6)  return '😈 Greater Demon'
    return                  '👿 Lesser Demon'
}

let handler = m => m

handler.before = async (m) => {
    if (!m.sender) return true
    const user = getDbUser(m.sender)
    if (!user) return true

    const level   = user.level || 0
    const newRole = getRole(level)

    // Update role kalau berbeda
    if (user.role !== newRole) user.role = newRole

    return true
}

module.exports = handler
module.exports.getRole = getRole
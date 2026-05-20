const fmt = n => Number(n || 0).toLocaleString('id-ID')

function ensureBank(user) {
    if (!user.bank)          user.bank          = 0
    if (!user.bankLog)       user.bankLog        = []
    if (!user.creditScore)   user.creditScore    = 500
    if (!user.asuransi)      user.asuransi       = false
    if (!user.asuransiExp)   user.asuransiExp    = 0
    if (!user.lastInterest)  user.lastInterest   = Date.now()
    if (!user.jailUntil)     user.jailUntil      = 0
    if (!user.invest)        user.invest         = 0
    if (!user.investTime)    user.investTime     = 0
    if (!user.portfolio)     user.portfolio      = {}  // { COIN: jumlah }
    if (!user.staking)       user.staking        = {}  // { COIN: { jumlah, since, lockUntil } }
    return user
}

function addLog(user, type, amount, note = '') {
    if (!user.bankLog) user.bankLog = []
    user.bankLog.unshift({ type, amount, note, time: Date.now() })
    if (user.bankLog.length > 20) user.bankLog = user.bankLog.slice(0, 20)
}

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

module.exports = {
    ensureBank,
    addLog,
    saveDB,
    fmt
}
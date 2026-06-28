// plugins/setmoney.js
// Owner tool: set/kurangi uang user atau semua user
// Command:
//   .setmoney @user 5000     → set uang @user jadi 5000
//   .setmoney all 5000       → set semua user jadi 5000
//   .reducemoney @user 500   → kurangi 500 dari @user
//   .reducemoney all 500     → kurangi 500 dari semua user

const fmt = n => Number(n || 0).toLocaleString('id-ID')
const findUser = require('../lib/findUser')
const { resolveTargetUser } = require('../lib/resolveTarget')

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

let handler = async (m, { conn, command, args, isOwner, participants = [] }) => {
    if (!isOwner) return m.reply('❌ Hanya owner!')

    const cmd   = command.toLowerCase()
    const isSet = cmd === 'setmoney'
    const isRed = cmd === 'reducemoney'

    const isAll     = (args[0] || '').toLowerCase() === 'all'
    const target    = isAll ? null : resolveTargetUser({ m, args, conn, participants, candidate: args[0] })
    const amountArg = isAll ? args[1] : args[1]
    const amount    = parseInt(String(amountArg || '').replace(/[^0-9]/g, ''))

    if (isNaN(amount) || amount < 0) return m.reply(
        `❌ Format salah!\n\n` +
        `*.setmoney @user 5000* — set uang user\n` +
        `*.setmoney all 5000* — set semua user\n` +
        `*.reducemoney @user 500* — kurangi uang user\n` +
        `*.reducemoney all 500* — kurangi semua user`
    )

    const users = global.db.data.users || {}

    // ── Apply money ke satu user ──────────────────────────────────
    function applyMoney(user) {
        const before = user.money || 0
        let after
        if (isSet) {
            user.money = amount
            after = amount
        } else if (isRed) {
            user.money = Math.max(0, (user.money || 0) - amount)
            after = user.money
        }
        return { before, after }
    }

    // ── ALL users ─────────────────────────────────────────────────
    if (isAll) {
        const registered = Object.entries(users).filter(([, u]) => u.registered)
        if (!registered.length) return m.reply('❌ Belum ada user terdaftar.')

        let count = 0
        for (const [, u] of registered) {
            applyMoney(u)
            count++
        }
        await saveDB()

        const action = isSet ? 'diset ke' : 'dikurangi'
        return m.reply(
            `✅ *Berhasil!*\n\n` +
            `👥 Total user: *${count}*\n` +
            `💰 Uang ${action}: *${fmt(amount)} koin*\n\n` +
            `_Semua user terdaftar terpengaruh_`
        )
    }

    // ── Single user ───────────────────────────────────────────────
    if (!target) return m.reply(
        `❌ Target user tidak ditemukan atau gunakan *all*!\n\n` +
        `Contoh:\n` +
        `• *.setmoney @user 5000*\n` +
        `• *.setmoney 6281xxxx 5000*\n` +
        `• reply pesan user lalu *.setmoney 5000*\n` +
        `• *.reducemoney @user 500*`
    )

    const _sResult = findUser(target.jid, participants, conn)
    if (!_sResult) return m.reply('❌ User tidak ditemukan di database!')
    const targetUser     = _sResult.user
    const resolvedTarget = _sResult.jid

    const { before, after } = applyMoney(targetUser)
    await saveDB()

    const action = isSet ? 'SET MONEY' : 'REDUCE MONEY'
    const diff   = after - before

    return conn.sendMessage(m.chat, {
        text:
            `╔══════════════════╗\n` +
            `  💰 *${action}*\n` +
            `╚══════════════════╝\n\n` +
            `👤 Target: @${resolvedTarget.split('@')[0].split(':')[0]}\n` +
            `${isSet ? '📌' : '➖'} Jumlah: ${isSet ? '' : '-'}${fmt(amount)} koin\n` +
            `📊 Sebelum: ${fmt(before)} koin\n` +
            `💰 Sesudah: ${fmt(after)} koin`,
        mentions: [resolvedTarget]
    }, { quoted: m })
}

handler.help    = ['setmoney @user/reply/nomor/all <jml>', 'reducemoney @user/reply/nomor/all <jml>']
handler.tags    = ['owner']
handler.command = /^(setmoney|reducemoney)$/i
handler.owner   = true

module.exports = handler

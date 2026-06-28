const { resolveTargetUser } = require('../lib/resolveTarget')
const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')

const MINIMAL_TRANSFER = 100
const MAKSIMAL_TRANSFER = 90000000000000

function getUser(jid) {
    return getDbUser(jid)
}

function sameUser(a, b) {
    return jidToNum(a) === jidToNum(b)
}

function tambahRiwayat(user, data) {
    if (!user.riwayatTransfer) user.riwayatTransfer = []
    user.riwayatTransfer.unshift(data)
    if (user.riwayatTransfer.length > 10) user.riwayatTransfer.pop()
}

function formatMoney(angka) {
    return Number(angka || 0).toLocaleString('id-ID')
}

function isMenuArg(arg = '') {
    return ['saldo', 'riwayat', 'top'].includes(String(arg).toLowerCase())
}

function parseNominal(target, args) {
    const index = target?.source === 'text' ? 1 : 0
    const raw = args[index + 1] ?? args[index]
    return parseInt(raw, 10)
}

async function prosesTransfer({ m, conn, args, usedPrefix, participants, user, sender, now }) {
    const target = resolveTargetUser({ m, args, conn, participants, candidate: args[0] })
    if (!target || isMenuArg(args[0])) return false

    const senderKey = jidToNum(sender)
    const targetUser = getDbUser(target.key)
    const targetJid = numToJid(target.key)
    const nominal = parseNominal(target, args)

    if (!nominal || Number.isNaN(nominal)) {
        return m.reply(
            `❌ *Nominal tidak valid!*\n\n` +
            `Contoh:\n` +
            `• ${usedPrefix}kirim @628xxx 50000\n` +
            `• ${usedPrefix}kirim 6281xxxx 50000\n` +
            `• reply pesan user lalu ketik ${usedPrefix}kirim 50000`
        )
    }

    if (nominal < MINIMAL_TRANSFER) return m.reply(`❌ Minimal transfer *${formatMoney(MINIMAL_TRANSFER)}*`)
    if (nominal > MAKSIMAL_TRANSFER) return m.reply(`❌ Maksimal transfer *${formatMoney(MAKSIMAL_TRANSFER)}*`)
    if (sameUser(target.key, senderKey)) return m.reply('❌ Tidak bisa transfer ke diri sendiri!')
    if (!targetUser) return m.reply('❌ User penerima tidak ditemukan / belum daftar.')

    const saldoPengirim = Number(user.money || 0)
    if (saldoPengirim < nominal) {
        return m.reply(
            `❌ *Saldo tidak cukup! Tarik dari bank terlebih dahulu dengan .wd*\n\n` +
            `💰 Uang kamu : ${formatMoney(saldoPengirim)}\n` +
            `💸 Transfer   : ${formatMoney(nominal)}`
        )
    }

    const saldoPenerima = Number(targetUser.money || 0)
    user.money = saldoPengirim - nominal
    targetUser.money = saldoPenerima + nominal

    const namaPengirim = user.name || senderKey
    const namaPenerima = targetUser.name || target.key

    tambahRiwayat(user, { tipe: 'keluar', nominal, nama: namaPenerima, waktu: now })
    tambahRiwayat(targetUser, { tipe: 'masuk', nominal, nama: namaPengirim, waktu: now })

    await global.db.write()

    await m.reply(
        `✅ *KIRIM UANG BERHASIL!*\n\n` +
        `📤 Pengirim   : ${namaPengirim}\n` +
        `📥 Penerima   : ${namaPenerima}\n` +
        `💸 Nominal    : ${formatMoney(nominal)}\n` +
        `💰 Sisa Saldo : ${formatMoney(user.money)}\n` +
        `🕐 Waktu      : ${now}`
    )

    await conn.sendMessage(targetJid, {
        text:
            `🎉 *KAMU MENERIMA UANG!*\n\n` +
            `📥 Dari       : ${namaPengirim}\n` +
            `💰 Nominal    : ${formatMoney(nominal)}\n` +
            `💵 Saldo Baru : ${formatMoney(targetUser.money)}\n` +
            `🕐 Waktu      : ${now}`
    }).catch(() => {})

    return true
}

let handler = async (m, { conn, args, usedPrefix, participants = [] }) => {
    const sender = m.sender
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })

    const user = getUser(sender)
    if (!user) return m.reply('❌ Data user tidak ditemukan! Daftar dulu.')

    const money = formatMoney(user.money)

    if (!args[0]) {
        return m.reply(
            `┌─────────────────────┐\n` +
            `│   💸 *KIRIM UANG*   │\n` +
            `└─────────────────────┘\n\n` +
            `👤 *User*   : ${user.name || m.name || sender.replace('@s.whatsapp.net', '')}\n` +
            `💰 *Saldo*  : ${money} rupiah di dompet\n\n` +
            `📋 *MENU TERSEDIA:*\n` +
            `┌────────────────────\n` +
            `│ ➡️  *${usedPrefix}kirim @tag nominal*\n` +
            `│     Bisa juga reply atau pakai nomor 628xxx\n` +
            `│\n` +
            `│ 💰  *${usedPrefix}dompet*\n` +
            `│     Cek uang kamu\n` +
            `│\n` +
            `│ 📋  *${usedPrefix}kirim riwayat*\n` +
            `│     10 transaksi terakhir\n` +
            `│\n` +
            `│ 🏆  *${usedPrefix}kirim top*\n` +
            `│     Top 5 saldo terbanyak\n` +
            `└────────────────────\n\n` +
            `_© ${global.namabot || 'ShiraoriBOT'}_`
        )
    }

    if (args[0] === 'saldo') {
        return m.reply(
            `💰 *CEK SALDO*\n\n` +
            `👤 User  : ${user.name || m.name || sender.replace('@s.whatsapp.net', '')}\n` +
            `💵 Saldo : ${money} rupiah di dompet\n` +
            `🕐 Waktu : ${now}`
        )
    }

    if (args[0] === 'riwayat') {
        const riwayat = user.riwayatTransfer || []
        if (riwayat.length === 0) return m.reply('📋 Belum ada riwayat transaksi.')

        let teks = `📋 *RIWAYAT TRANSAKSI*\n` +
            `👤 ${user.name || sender.replace('@s.whatsapp.net', '')}\n` +
            `${'—'.repeat(25)}\n\n`

        riwayat.forEach((r, i) => {
            teks +=
                `*${i + 1}.* ${r.tipe === 'masuk' ? '📥' : '📤'} *${r.tipe.toUpperCase()}*\n` +
                `   💵 ${formatMoney(r.nominal)}\n` +
                `   👤 ${r.tipe === 'masuk' ? 'Dari' : 'Ke'}: ${r.nama}\n` +
                `   🕐 ${r.waktu}\n\n`
        })

        return m.reply(teks.trim())
    }

    if (args[0] === 'top') {
        const users = global.db.data.users || {}
        const entries = Object.entries(users)
            .filter(([, u]) => u && typeof u.money === 'number')
            .sort((a, b) => b[1].money - a[1].money)
            .slice(0, 5)

        if (entries.length === 0) return m.reply('🏆 Belum ada data saldo.')

        let teks = `🏆 *TOP 5 SALDO TERBANYAK*\n${'—'.repeat(25)}\n\n`
        const medal = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

        entries.forEach(([jid, u], i) => {
            const nama = u.name || jid.replace('@s.whatsapp.net', '')
            teks += `${medal[i]} *${nama}*\n   💰 ${formatMoney(u.money)}\n\n`
        })

        return m.reply(teks.trim())
    }

    const done = await prosesTransfer({ m, conn, args, usedPrefix, participants, user, sender, now })
    if (done) return

    m.reply(`❌ Perintah tidak dikenali.\nKetik *${usedPrefix}kirim* untuk melihat menu.`)
}

handler.tags = ['ekonomi']
handler.help = ['kirim <@tag/reply/nomor> <nominal>', 'kirim riwayat', 'kirim top']
handler.command = ['kirim']
handler.register = true

module.exports = handler

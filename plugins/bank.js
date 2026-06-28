// plugins/bank.js
// ═══════════════════════════════════════════════════════════════════
//  🏦 SISTEM BANK — ShiraoriBOT
//
//  Command:
//    .bank                  → info saldo bank kamu
//    .dep <jumlah/all>      → deposit uang ke bank
//    .wd <jumlah/all>       → withdraw uang dari bank
//    .transfer @user <jml>  → transfer ke user lain
//    .rob bank              → rampok bank (risiko tinggi!)
//    .bank log              → riwayat 10 transaksi terakhir
//    .beli asuransi         → beli proteksi bank (5000 koin)
//    .creditcore            → lihat credit score kamu
// ═══════════════════════════════════════════════════════════════════


const sleep = ms => new Promise(r => setTimeout(r, ms))
const { generateWAMessageFromContent, proto } = require('../lib/baileys-compat')
const { ensureBank, addLog, saveDB, fmt } = require('../database/bankHelper')
const findUser = require('../lib/findUser')
const { getDbUser } = require('../lib/jidUtils')


// ── Hitung bunga tabungan (1% per hari) ──────────────────────────────────────
function applyInterest(user) {
    const now     = Date.now()
    const oneDay  = 24 * 60 * 60 * 1000
    const elapsed = now - (user.lastInterest || now)
    const days    = Math.floor(elapsed / oneDay)
    if (days < 1 || user.bank <= 0) return 0
    const interest = Math.floor(user.bank * 0.01 * days)
    user.bank         += interest
    user.lastInterest  = now
    addLog(user, 'BUNGA', interest, `Bunga tabungan ${days} hari`)
    return interest
}

// ── Parse bet/jumlah ──────────────────────────────────────────────────────────
function parseAmount(input, max) {
    if (!input) return null
    const s = String(input).toLowerCase().trim()
    if (s === 'all' || s === 'semua') return max
    const n = parseInt(s.replace(/[^0-9]/g, ''))
    return isNaN(n) || n <= 0 ? null : Math.min(n, max)
}


// ── Format waktu relatif ──────────────────────────────────────────────────────
function timeAgo(ts) {
    if (!ts) return '-'
    const d = Date.now() - ts
    const m = Math.floor(d / 60000)
    const h = Math.floor(d / 3600000)
    if (h >= 24) return `${Math.floor(h / 24)} hari lalu`
    if (h >= 1)  return `${h} jam lalu`
    return `${m} menit lalu`
}

// ── Credit score label ────────────────────────────────────────────────────────
function creditLabel(score) {
    if (score >= 800) return '⭐ EXCELLENT'
    if (score >= 650) return '✅ GOOD'
    if (score >= 500) return '🟡 FAIR'
    if (score >= 300) return '🟠 POOR'
    return '🔴 VERY POOR'
}

// ══════════════════════════════════════════════════════════════════════════════
//  HANDLER
// ══════════════════════════════════════════════════════════════════════════════
let handler = async (m, { conn, command, args, usedPrefix, participants = [] }) => {
    const cmd    = command.toLowerCase()
    const sender = m.sender

    // ── Lookup user: pakai getDbUser yang resolve @lid, JID, nomor, format lama ──
    const user = getDbUser(sender) || (() => {
        // Fallback: coba lewat findUser jika sender masih @lid
        const found = findUser(sender, participants, conn)
        return found ? found.user : null
    })()
    if (!user) return m.reply('❌ Kamu belum terdaftar! Ketik *.daftar* dulu.')
    ensureBank(user)

    // ── Cek bunga otomatis tiap aksi ──────────────────────────────────────────
    const interest = applyInterest(user)

    // ── Bonus bank 1%/jam ─────────────────────────────────────────────────────
    let bonusBank = 0
    if ((user.bank || 0) > 0) {
        const now = Date.now()
        if (!user.lastTax) { user.lastTax = now }
        else {
            const elapsed = (now - user.lastTax) / (60 * 60 * 1000)
            if (elapsed >= 0.01) {
                let rate = Math.floor(user.bank * 0.01)
                if (rate < 1000) rate = 1000
                if (rate > 20000) rate = 20000
                bonusBank    = Math.floor(rate * elapsed)
                user.bank    += bonusBank
                user.lastTax = now
                if (bonusBank > 0) {
                    try { addLog(user, 'BUNGA', bonusBank, 'Bonus bunga per jam') } catch (_) {}
                }
            }
        }
    }
    if (interest > 0 || bonusBank > 0) await saveDB()

    // ── .bank → info saldo ────────────────────────────────────────────────────
    if (/^bank$/.test(cmd) && !args[0]) {
        const asuransiAktif  = user.asuransi && user.asuransiExp > Date.now()
        const asuransiStatus = asuransiAktif
            ? `✅ Aktif (exp: ${new Date(user.asuransiExp).toLocaleDateString('id-ID')})`
            : '❌ Tidak aktif'

        const bankLine = user.bank > 0
            ? `│  🏦 *Bank   :* ${fmt(user.bank)} rupiah${bonusBank > 0 ? ` _(bunga +${fmt(bonusBank)})_` : ''}`
            : `│  🏦 *Bank   :* 0 rupiah`

        const bodyText = [
            '╭─「 🏦 *BANK NEGARA* 」',
            '│',
            `│  👤 *${user.name || 'User'}*`,
            `│  💵 *Dompet :* ${fmt(user.money)} rupiah`,
            bankLine,
            user.bank > 0 ? '│  🕐 *Bunga bank:* +1%/jam' : null,
            `│  💰 *Total  :* ${fmt((user.money || 0) + (user.bank || 0))} rupiah`,
            '│',
            interest > 0 ? `│  📈 *Bunga hari ini:* +${fmt(interest)} rupiah` : null,
            `│  📊 *Credit Score:* ${user.creditScore} ${creditLabel(user.creditScore)}`,
            `│  🛡️ *Asuransi:* ${asuransiStatus}`,
            '│',
            '│  Pilih menu di bawah:',
            '╰─────────────────',
        ].filter(Boolean).join('\n')

        const wm = global.wm || global.namabot || 'ShiraoriBOT'

        const buttons = [
            ['🎒 Inventory', `${usedPrefix}inv`],
            ['💵 Dompet', `${usedPrefix}dompet`],
            ['📋 Menu', `${usedPrefix}menu`]
        ]
        return conn.sendButton(m.chat, bodyText, wm, buttons, m)
    }

    // ── .creditcore → info credit score ──────────────────────────────────────
    if (/^creditcore$/.test(cmd)) {
        const score = user.creditScore || 500
        const bar   = Math.floor(score / 100)
        const barStr = '█'.repeat(bar) + '░'.repeat(10 - bar)

        return m.reply(
            `╭─「 📊 *Credit Score* 」\n│\n` +
            `│  Skor: *${score}/1000*\n` +
            `│  [${barStr}]\n` +
            `│  Status: ${creditLabel(score)}\n│\n` +
            `│  *Efek skor terhadap pinjol:*\n` +
            `│  ⭐ 800+ → bunga 1%, limit 50.000\n` +
            `│  ✅ 650+ → bunga 1.5%, limit 30.000\n` +
            `│  🟡 500+ → bunga 2%, limit 20.000\n` +
            `│  🟠 300+ → bunga 3%, limit 10.000\n` +
            `│  🔴 <300 → bunga 5%, limit 5.000\n│\n` +
            `│  *Cara naikkan skor:*\n` +
            `│  • Bayar pinjol tepat waktu → +50\n` +
            `│  • Deposit rutin → +10\n│\n` +
            `╰─ Kelola keuanganmu dengan bijak!`
        )
    }

    // ── .dep → deposit ────────────────────────────────────────────────────────
    if (/^dep(osit)?$/.test(cmd)) {
        const amount = parseAmount(args[0], user.money || 0)
        if (!amount) return m.reply(
            `❌ Masukkan jumlah!\n\nContoh:\n• *.dep 5000*\n• *.dep all*\n\n💵 Dompet: ${fmt(user.money)} rupiah`
        )
        if ((user.money || 0) < amount) return m.reply(`❌ Uang tidak cukup! Dompet: ${fmt(user.money)} rupiah`)

        user.money -= amount
        user.bank  += amount
        user.creditScore = Math.min(1000, (user.creditScore || 500) + 10)
        addLog(user, 'DEPOSIT', amount, 'Deposit ke bank')
        await saveDB()

        return m.reply(
            `✅ *Deposit Berhasil!*\n\n` +
            `💰 Deposit: *+${fmt(amount)} rupiah*\n` +
            `🏦 Saldo Bank: *${fmt(user.bank)} rupiah*\n` +
            `💵 Dompet: *${fmt(user.money)} rupiah*\n\n` +
            `📈 Credit score +10 → ${user.creditScore}`
        )
    }

    // ── .wd → withdraw ────────────────────────────────────────────────────────
    if (/^wd|withdraw$/.test(cmd)) {
        const amount = parseAmount(args[0], user.bank || 0)
        if (!amount) return m.reply(
            `❌ Masukkan jumlah!\n\nContoh:\n• *.wd 5000*\n• *.wd all*\n\n🏦 Saldo Bank: ${fmt(user.bank)} koin`
        )
        if ((user.bank || 0) < amount) return m.reply(`❌ Saldo bank tidak cukup! Bank: ${fmt(user.bank)} koin`)

        user.bank  -= amount
        user.money += amount
        addLog(user, 'WITHDRAW', amount, 'Tarik dari bank')
        await saveDB()

        return m.reply(
            `✅ *Withdraw Berhasil!*\n\n` +
            `💸 Tarik: *${fmt(amount)} rupiah*\n` +
            `🏦 Saldo Bank: *${fmt(user.bank)} rupiah*\n` +
            `💵 Dompet: *${fmt(user.money)} rupiah*`
        )
    }

    // ── .transfer @user <jml> ─────────────────────────────────────────────────
    if (/^(transfer|tf)$/.test(cmd)) {
        const targetJid = m.mentionedJid?.[0]
        const amount    = parseAmount(args[1] || args[0], user.bank || 0)

        if (!targetJid || !amount) return m.reply(
            `❌ Format salah!\n\nContoh: *.tf @user 5000*\n\n💵 Bank: ${fmt(user.bank)} rupiah`
        )
        if (targetJid === sender) return m.reply('❌ Tidak bisa transfer ke diri sendiri!')
        // coldown
        if (!user.lastTransfer) user.lastTransfer = 0
        const cooldown = 60 * 2000
        if (Date.now() - user.lastTransfer < cooldown) {
            return m.reply('⏳ Tunggu sebelum transfer lagi!')
        }
        // pajak
        const fee = Math.floor(amount * 0.001)
        const total = amount + fee
        const _tResult = findUser(targetJid, participants, conn)
        if (!_tResult) return m.reply('❌ Target tidak terdaftar!')
        const targetUser = _tResult.user
        const resolvedTarget = _tResult.jid
        if (user.bank < total) return m.reply(`❌ Uang tidak cukup! Bank: ${fmt(user.bank)} rupiah (Ada pajak ${fmt(total)})`)

        ensureBank(targetUser)
        user.bank       -= total
        targetUser.bank += amount
        user.lastTransfer = Date.now()
        addLog(user, 'TRANSFER_OUT', -amount, `Transfer ke Bank @${resolvedTarget.split('@')[0]} + pajak`)
        addLog(targetUser, 'TRANSFER_IN', amount, `Terima transfer dari bank @${sender.split('@')[0]}`)
        await saveDB()

        await conn.sendMessage(m.chat, {
            text:
                `✅ *Transfer Berhasil!*\n\n` +
                `💸 Jumlah: *${fmt(amount)} rupiah*\n` +
                `🧾 Pajak: ${fmt(fee)}\n` +
                `📤 Dari: *${user.name || 'kamu'}*\n` +
                `📥 Ke: @${resolvedTarget.split('@')[0].split(':')[0]}\n\n` +
                `💵 Sisa uang di bank: *${fmt(user.bank)} rupiah*`,
            mentions: [targetJid]
        })
        return
    }

    // ── .bank log → riwayat ───────────────────────────────────────────────────
    if (/^bank$/.test(cmd) && (args[0] || '').toLowerCase() === 'log') {
        const logs = user.bankLog || []
        if (!logs.length) return m.reply('📭 Belum ada riwayat transaksi.')

        const typeEmoji = {
            DEPOSIT: '📥', WITHDRAW: '📤', TRANSFER_OUT: '➡️',
            TRANSFER_IN: '⬅️', BUNGA: '📈', PINJOL: '💳',
            BAYAR_PINJOL: '✅', DENDA: '⚠️', ROB: '🎰'
        }

        const list = logs.slice(0, 10).map((l, i) =>
            `│  ${i + 1}. ${typeEmoji[l.type] || '📌'} *${l.type}*\n` +
            `│      ${l.amount > 0 ? '+' : ''}${fmt(l.amount)} rupiah\n` +
            `│      ${l.note} • ${timeAgo(l.time)}`
        ).join('\n│\n')

        return m.reply(
            `╭─「 🧾 *Riwayat Transaksi* 」\n│\n` +
            list + '\n│\n' +
            `╰─ 10 transaksi terakhir`
        )
    }

    // ── .beli asuransi ────────────────────────────────────────────────────────
    if (/^bank$/.test(cmd) && (args[0] || '').toLowerCase() === 'asuransi') {
        const HARGA = 5000000
        if (user.asuransi && user.asuransiExp > Date.now()) return m.reply(
            `⚠️ Asuransimu masih aktif!\nExp: ${new Date(user.asuransiExp).toLocaleDateString('id-ID')}`
        )
        if ((user.money || 0) < HARGA) return m.reply(
            `❌ Uang tidak cukup! Butuh ${fmt(HARGA)} rupiah.\nDompet: ${fmt(user.money)} rupiah`
        )
        user.money     -= HARGA
        user.asuransi   = true
        user.asuransiExp = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 hari
        addLog(user, 'ASURANSI', -HARGA, 'Beli asuransi bank 7 hari')
        await saveDB()

        return m.reply(
            `🛡️ *Asuransi Bank Aktif!*\n\n` +
            `Masa aktif: *7 hari*\n` +
            `Proteksi: Uang bank aman dari *.rob bank*\n\n` +
            `💸 Bayar: ${fmt(HARGA)} rupiah\n` +
            `💵 Sisa: ${fmt(user.money)} rupiah`
        )
    }

    // ── .rob bank ────────────────────────────────────────────────────────────
    if (/^rob$/.test(cmd) && (args[0] || '').toLowerCase() === 'bank') {
        const now = Date.now()
        const robTargetJid = m.mentionedJid?.[0]
            if (!robTargetJid) return m.reply('❌ Tag target!\n\nContoh: *.rob bank @user*')
            const _robResult = findUser(robTargetJid, participants, conn)
            if (!_robResult) return m.reply('❌ Target tidak terdaftar! Tag pengguna yang ingin kamu rampok banknya.\n\nContoh: *.rob bank @user*')
            const target = _robResult.user
            const targetJid = _robResult.jid
            if ((target.bank || 0) <= 1000) return m.reply('❌ Target tidak punya uang di bank! Pilih target lain.')
            
        // Cek penjara
        if (user.jailUntil > now) {
            const sisa = Math.ceil((user.jailUntil - now) / 60000)
            return m.reply(
                `🚔 Kamu masih di *PENJARA*!\n` +
                `Bebas dalam: *${sisa} menit*\n\n` +
                `_Kapok maling bank?_ 😈`
            )
        }

        await conn.sendMessage(m.chat, {
            text: `🕵️ *${m.name || 'Kamu'}* sedang membobol bank @${targetJid.split('@')[0]}\n⏳ Menunggu hasil...`,
            mentions: [targetJid]
        })
        await sleep(10000)

        const roll = Math.random() * 100

        if (roll < 30) {
            // SUKSES (30%)
           
            const pct    = 0.05 + Math.random() * 0.30 // 5% - 35% dari total uang di bank target
            const stolen = Math.floor((target.bank || 0) * pct)
            ensureBank(target)
            // Cek asuransi target
            if (target.asuransi && target.asuransiExp > now) {
                // Asuransi aktif, gagal dan masuk penjara
                user.jailUntil = now + 30 * 60 * 1000
                addLog(user, 'ROB', 0, 'Rob bank gagal — target pakai asuransi')
                await saveDB()
                return m.reply(
                    `🛡️ TARGET PAKAI ASURANSI!\n\n` +
                    `Sistem keamanan aktif, kamu tertangkap!\n` +
                    `🚔 Masuk penjara *30 menit*!`
                )
            }

            target.bank    = Math.max(0, (target.bank || 0) - stolen)
            user.money    += stolen
            addLog(user, 'ROB', stolen, `Rob bank berhasil`)
            addLog(target, 'DENDA', -stolen, `Kena rampok`)
            await saveDB()

            await conn.sendMessage(m.chat, {
                text:
                `💰 *ROB BANK BERHASIL!*\n\n` +
                `🎰 Berhasil bobol brankas @${targetJid.split('@')[0]} \n` +
                `💵 Dapat: *+${fmt(stolen)} rupiah*\n` +
                `💰 Dompet: *${fmt(user.money)} rupiah*\n\n` +
                `_Kabur sebelum polisi datang!_`,
                mentions: [targetJid]
        })
        return
        } else if (roll < 70) {
            // KETANGKAP (40%) — masuk penjara
            const jailTime = 60 + Math.floor(Math.random() * 60) // 1-2 jam
            user.jailUntil = now + jailTime * 60 * 1000
            const fine     = Math.floor(250000 + Math.random() * 500000)
            let sisa = fine

if (user.bank >= sisa) {
    user.bank -= sisa
} else {
    sisa -= user.bank
    user.bank = 0
    user.money = Math.max(0, user.money - sisa)}
            addLog(user, 'DENDA', -fine, `Ketangkap rob bank, denda ${fmt(fine)}`)
            // ── Denda rob bank masuk kas negara + rekam kriminal ─────
            try {
                const { addTaxToTreasury, addCriminalRecord, ensureUserCountryFields } = require('./negara')
                addTaxToTreasury(fine)
                ensureUserCountryFields(user)
                addCriminalRecord(user, 2) // rob bank = 2 catatan kriminal
            } catch (_) {}
            await saveDB()

            return m.reply(
                `🚔 *TERTANGKAP POLISI!*\n\n` +
                `🚨 Alarm berbunyi keras!\n` +
                `👮 Polisi berdatangan!\n` +
                `⛓️ Masuk *PENJARA ${jailTime} menit*!\n` +
                `💸 Denda: *-${fmt(fine)} rupiah*\n\n` +
                `🏦 Bank: ${fmt(user.bank)} rupiah\n` +
                `💵 Dompet: ${fmt(user.money)} rupiah`
            )

        } else {
            // GAGAL KONYOL (30%)
            const scenarios = [
                '💥 Kamu salah masuk — itu toko roti, bukan bank!',
                '📸 Langsung ketangkap satpam sebelum masuk!',
                '😴 Kamu ketiduran di depan ATM...',
                '🐕 Anjing penjaga bank mengejarmu!',
                '🤦 Lupa kodenya, brankas tidak terbuka!',
            ]
            return m.reply(
                `❌ *ROB BANK GAGAL!*\n\n` +
                `${pick(scenarios)}\n\n` +
                `_Untung tidak ketangkap, coba lagi nanti!_`
            )
        }
    }
}

// Helper pick untuk rob bank
const pick = arr => arr[Math.floor(Math.random() * arr.length)]

handler.help    = [
    'bank - info saldo & bank',
    'dep <jml/all> - deposit ke bank',
    'wd <jml/all> - withdraw dari bank',
    'transfer @user <jml> - kirim uang',
    'rob bank - rampok bank',
    'bank log - riwayat transaksi',
    'bank asuransi - proteksi bank',
    'creditcore - lihat credit score',
]
handler.tags    = ['ekonomi']
handler.command = /^(bank|dep|deposit|wd|withdraw|transfer|tf|rob|creditcore)$/i
handler.register= true

module.exports = handler
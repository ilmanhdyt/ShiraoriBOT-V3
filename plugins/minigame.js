// plugins/minigame.js
// 🎮 MINIGAME — Tebak Angka | Hangman | Matematika
// Command  : .game [easy/medium/hard]
// Hadiah   : easy 300rb | medium 900rb | hard 2.1jt per game
// Limit    : 1000x/hari (praktis unlimited)
// Timer    : 30 detik/soal | 3 ronde/game

const { getDbUser }              = require('../lib/jidUtils')
const { checkWalletCap,
        notifyWalletCap }        = require('./dompet')

// ─────────────────────────────────────────────────────────
//  KONSTANTA
// ─────────────────────────────────────────────────────────
const LIMIT_PER_DAY = 1000
const RONDE         = 3
const TIMER_MS      = 30_000   // 30 detik
const HINT_MS       = 15_000   // hint muncul di detik ke-15

// Hadiah TOTAL per game (dibagi 3 ronde = per-ronde)
const DIFFICULTY = {
    easy  : { label: '🟢 Easy',   hadiahTotal: 300_000   },
    medium: { label: '🟡 Medium', hadiahTotal: 900_000   },
    hard  : { label: '🔴 Hard',   hadiahTotal: 2_100_000 }
}

const GAME_TYPES = ['tebak', 'hangman', 'math']

// ─────────────────────────────────────────────────────────
//  WORD LIST — HANGMAN
// ─────────────────────────────────────────────────────────
const WORDS = {
    easy  : ['kucing', 'anjing', 'buku', 'meja', 'kursi', 'rumah', 'mobil',
             'bulan', 'bintang', 'hujan', 'pagi', 'sore', 'malam', 'dapur',
             'pintu', 'lampu', 'baju', 'celana', 'sepatu', 'tangan'],
    medium: ['komputer', 'telepon', 'jendela', 'kamera', 'televisi', 'kulkas',
             'sepeda', 'pesawat', 'stasiun', 'bandara', 'sekolah', 'rumahsakit',
             'perpustakaan', 'kecamatan', 'pelabuhan'],
    hard  : ['laboratorium', 'keseimbangan', 'pemerintahan', 'internasional',
             'pembangunan', 'kewarganegaraan', 'pertanggungjawaban',
             'kesejahteraan', 'ketidakpastian', 'penyelenggaraan']
}

// ─────────────────────────────────────────────────────────
//  IN-MEMORY GAME STATE
// ─────────────────────────────────────────────────────────
const activeGames = {}

// ─────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────
const fmt     = n   => Number(n || 0).toLocaleString('id-ID')
const pick    = arr => arr[Math.floor(Math.random() * arr.length)]
const divider = ()  => String.fromCharCode(0x2500).repeat(28)

function getUser(sender) {
    return getDbUser(sender)
}

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

// Limit harian
function cekLimit(sender) {
    const user = getUser(sender)
    if (!user) return false
    if (!user.lastGameDate) user.lastGameDate = 0
    if (!user.gameCount)    user.gameCount    = 0
    const today    = new Date().toDateString()
    const lastDate = new Date(user.lastGameDate).toDateString()
    if (today !== lastDate) { user.gameCount = 0; user.lastGameDate = Date.now() }
    return user.gameCount < LIMIT_PER_DAY
}

function tambahLimit(sender) {
    const user = getUser(sender)
    if (!user) return
    if (!user.gameCount) user.gameCount = 0
    user.gameCount++
    user.lastGameDate = Date.now()
}

function sisaLimit(sender) {
    const user = getUser(sender)
    if (!user) return 0
    const today    = new Date().toDateString()
    const lastDate = new Date(user.lastGameDate || 0).toDateString()
    if (today !== lastDate) return LIMIT_PER_DAY
    return LIMIT_PER_DAY - (user.gameCount || 0)
}

// Wallet cap
async function applyCapAndNotify(user, conn, senderJid) {
    const cap = checkWalletCap(user)
    if (cap.triggered) {
        const jid = senderJid.includes('@') ? senderJid : senderJid + '@s.whatsapp.net'
        notifyWalletCap(conn, jid, cap.excess, user.bank || 0).catch(() => {})
    }
}

// ─────────────────────────────────────────────────────────
//  SOAL GENERATOR
// ─────────────────────────────────────────────────────────
function buatSoalTebak(diff) {
    const ranges = { easy: [1, 20], medium: [1, 100], hard: [100, 999] }
    const [min, max] = ranges[diff]
    const angka = Math.floor(Math.random() * (max - min + 1)) + min
    return {
        soal : `🔢 *Tebak Angka*\n\nAku memikirkan sebuah angka antara *${min}* sampai *${max}*.\nApa angka yang aku pikirkan?`,
        jawab: String(angka),
        hint : `Hint: angkanya ${angka % 2 === 0 ? 'genap' : 'ganjil'}, ${angka > (min + max) / 2 ? 'lebih besar dari' : 'kurang dari'} ${Math.round((min + max) / 2)}`
    }
}

function buatSoalHangman(diff) {
    const kata   = pick(WORDS[diff])
    const huruf  = kata[0]
    const akhir  = kata[kata.length - 1]
    const tampil = kata.split('').map((h, i) => (i === 0 ? h : '_')).join(' ')
    return {
        soal : `🔤 *Hangman*\n\nTebak kata ini:\n\`${tampil}\`\n\n• Huruf pertama : *${huruf}*\n• Panjang kata  : *${kata.length}* huruf`,
        jawab: kata,
        hint : `Hint: huruf terakhir *${akhir}*, huruf tengah *${kata[Math.floor(kata.length / 2)]}*`
    }
}

function buatSoalMath(diff) {
    let soal, jawab, hint
    if (diff === 'easy') {
        const a   = Math.floor(Math.random() * 20) + 1
        const b   = Math.floor(Math.random() * 20) + 1
        const ops = pick(['+', '-'])
        soal  = `${a} ${ops} ${b}`
        jawab = ops === '+' ? a + b : a - b
        hint  = `Hint: hasilnya ${jawab > 10 ? 'lebih dari 10' : '10 atau kurang'}`
    } else if (diff === 'medium') {
        const a   = Math.floor(Math.random() * 50) + 1
        const b   = Math.floor(Math.random() * 10) + 1
        const ops = pick(['+', '-', 'x'])
        soal  = `${a} ${ops} ${b}`
        jawab = ops === '+' ? a + b : ops === '-' ? a - b : a * b
        hint  = `Hint: hasilnya ${jawab > 0 ? 'positif' : 'negatif'} dan ${jawab % 2 === 0 ? 'genap' : 'ganjil'}`
    } else {
        const a   = Math.floor(Math.random() * 100) + 10
        const b   = Math.floor(Math.random() * 20) + 2
        const c   = Math.floor(Math.random() * 10) + 1
        const ops = pick(['+', '-'])
        soal  = `(${a} x ${b}) ${ops} ${c}`
        jawab = ops === '+' ? (a * b) + c : (a * b) - c
        hint  = `Hint: ${a} x ${b} = ${a * b}, kemudian ${ops} ${c}`
    }
    return {
        soal : `🧮 *Matematika*\n\nHitung:\n\n*${soal} = ?*`,
        jawab: String(jawab),
        hint
    }
}

function buatSoal(type, diff) {
    if (type === 'tebak')   return buatSoalTebak(diff)
    if (type === 'hangman') return buatSoalHangman(diff)
    if (type === 'math')    return buatSoalMath(diff)
}

// ─────────────────────────────────────────────────────────
//  RONDE ENGINE
// ─────────────────────────────────────────────────────────
async function mulaiRonde(conn, chat, sender) {
    const game = activeGames[`${chat}_${sender}`]
    if (!game) return
    if (game.ronde > RONDE) return selesaiGame(conn, chat, sender)

    const type = pick(GAME_TYPES)
    const soal = buatSoal(type, game.diff)

    game.jawaban  = soal.jawab
    game.hint     = soal.hint
    game.answered = false
    game.type     = type

    const sent = await conn.sendMessage(chat, {
        text:
            `${divider()}\n` +
            `🎮 *RONDE ${game.ronde} / ${RONDE}*  |  ${DIFFICULTY[game.diff].label}\n` +
            `${divider()}\n\n` +
            `${soal.soal}\n\n` +
            `⏳ Waktu       : *30 detik*\n` +
            `💰 Hadiah ronde: *+${fmt(game.hadiahPerRonde)} koin*\n\n` +
            `_Reply pesan ini untuk menjawab!_`
    }).catch(() => {})

    // Simpan ID pesan soal supaya jawaban harus reply ke sini
    game.soalMsgId = sent?.key?.id || null

    // Hint detik 15
    game.hintTimer = setTimeout(async () => {
        if (!game.answered) {
            await conn.sendMessage(chat, { text: `💡 ${soal.hint}` }).catch(() => {})
        }
    }, HINT_MS)

    // Timeout 30 detik
    game.timer = setTimeout(async () => {
        if (!game.answered) {
            game.answered = true
            game.ronde++
            const next = game.ronde > RONDE
            await conn.sendMessage(chat, {
                text:
                    `⌛ *Waktu Habis!*\n\n` +
                    `Jawaban yang benar: *${soal.jawab}*\n\n` +
                    `${next ? '🏁 Semua ronde selesai!' : `⏭️ Lanjut ronde ${game.ronde}...`}`
            }).catch(() => {})
            if (next) selesaiGame(conn, chat, sender)
            else setTimeout(() => mulaiRonde(conn, chat, sender), 3000)
        }
    }, TIMER_MS)
}

// ─────────────────────────────────────────────────────────
//  SELESAI GAME
// ─────────────────────────────────────────────────────────
async function selesaiGame(conn, chat, sender) {
    const key  = `${chat}_${sender}`
    const game = activeGames[key]
    if (!game) return

    const totalHadiah = game.hadiahDapat
    const user        = getUser(sender)

    if (user && totalHadiah > 0) {
        user.money = (user.money || 0) + totalHadiah
        await applyCapAndNotify(user, conn, sender)
    }

    tambahLimit(sender)
    await saveDB()

    const pct = Math.round((game.benar / RONDE) * 100)

    await conn.sendMessage(chat, {
        text:
            `${divider()}\n` +
            `🏁 *GAME SELESAI!*\n` +
            `${divider()}\n\n` +
            `🎮 Mode     : ${DIFFICULTY[game.diff].label}\n` +
            `✅ Benar    : ${game.benar}/${RONDE}  (${pct}%)\n` +
            `❌ Salah/Timeout: ${RONDE - game.benar}/${RONDE}\n\n` +
            `${totalHadiah > 0
                ? `💰 Hadiah   : *+${fmt(totalHadiah)} koin*`
                : `😔 Tidak ada hadiah (0 jawaban benar)`}\n` +
            `💵 Dompet   : *${fmt(user?.money || 0)} koin*\n\n` +
            `📊 Sisa main hari ini: *${sisaLimit(sender)}x*`
    }).catch(() => {})

    delete activeGames[key]
}

// ─────────────────────────────────────────────────────────
//  MAIN HANDLER
// ─────────────────────────────────────────────────────────
let handler = async (m, { conn, args, usedPrefix, command }) => {
    const sender  = m.sender
    const chat    = m.chat
    const gameKey = `${chat}_${sender}`
    const user    = getUser(sender)

    if (!user) return m.reply('❌ Data user tidak ditemukan. Daftar dulu dengan *.daftar*')

    const sub = (args[0] || '').toLowerCase()

    // ── MENU ──────────────────────────────────────────────
    if (!sub || sub === 'help' || sub === 'menu') {
        const sisa = sisaLimit(sender)
        return m.reply(
            `┌──────────────────────────┐\n` +
            `│       🎮 *MINIGAME*        │\n` +
            `└──────────────────────────┘\n\n` +
            `📋 *CARA MAIN:*\n` +
            `*${usedPrefix}game [kesulitan]*\n\n` +
            `🟢 *easy*   → Hadiah *${fmt(DIFFICULTY.easy.hadiahTotal)}*/game\n` +
            `🟡 *medium* → Hadiah *${fmt(DIFFICULTY.medium.hadiahTotal)}*/game\n` +
            `🔴 *hard*   → Hadiah *${fmt(DIFFICULTY.hard.hadiahTotal)}*/game\n\n` +
            `🎯 *Jenis Game:*\n` +
            `• 🔢 Tebak Angka\n` +
            `• 🔤 Hangman\n` +
            `• 🧮 Matematika\n\n` +
            `⏳ Timer  : 30 detik/soal\n` +
            `🔄 Ronde  : ${RONDE} soal/game\n\n` +
            `📊 Sisa main hari ini: *${sisa}x*\n\n` +
            `📌 *Command tambahan:*\n` +
            `• *${usedPrefix}game hint* — minta hint\n` +
            `• *${usedPrefix}game skip* — skip soal\n` +
            `• *${usedPrefix}game stop* — berhenti\n\n` +
            `Contoh: *${usedPrefix}game easy*`
        )
    }

    // ── HINT ──────────────────────────────────────────────
    if (sub === 'hint') {
        const game = activeGames[gameKey]
        if (!game) return m.reply('❌ Kamu tidak sedang main game.')
        return m.reply(`💡 ${game.hint}`)
    }

    // ── SKIP ──────────────────────────────────────────────
    if (sub === 'skip') {
        const game = activeGames[gameKey]
        if (!game) return m.reply('❌ Kamu tidak sedang main game.')
        clearTimeout(game.timer)
        clearTimeout(game.hintTimer)
        game.answered = true
        game.ronde++
        await m.reply(`⏭️ Soal diskip!\nJawaban: *${game.jawaban}*`)
        if (game.ronde > RONDE) selesaiGame(conn, chat, sender)
        else setTimeout(() => mulaiRonde(conn, chat, sender), 2000)
        return
    }

    // ── STOP ──────────────────────────────────────────────
    if (sub === 'stop') {
        const game = activeGames[gameKey]
        if (!game) return m.reply('❌ Kamu tidak sedang main game.')
        clearTimeout(game.timer)
        clearTimeout(game.hintTimer)
        delete activeGames[gameKey]
        return m.reply('🛑 Game dihentikan.')
    }

    // ── STATUS ────────────────────────────────────────────
    if (sub === 'status') {
        const game = activeGames[gameKey]
        if (!game) return m.reply('❌ Kamu tidak sedang main game.')
        return m.reply(
            `📊 *Status Game*\n` +
            `Mode    : ${DIFFICULTY[game.diff].label}\n` +
            `Ronde   : ${game.ronde}/${RONDE}\n` +
            `Benar   : ${game.benar}\n` +
            `Hadiah  : +${fmt(game.hadiahDapat)} koin`
        )
    }

    // ── MULAI GAME ────────────────────────────────────────
    if (['easy', 'medium', 'hard'].includes(sub)) {
        if (activeGames[gameKey]) {
            return m.reply(
                `⚠️ Kamu sedang main game!\n\n` +
                `Jawab dulu atau ketik *${usedPrefix}game stop*`
            )
        }

        if (!cekLimit(sender)) {
            return m.reply(
                `❌ *Limit harian habis!*\n\n` +
                `🎮 Limit  : ${LIMIT_PER_DAY}x/hari\n` +
                `🔄 Reset  : Besok pagi jam 00:00\n\n` +
                `_Main lagi besok ya!_`
            )
        }

        const diffData       = DIFFICULTY[sub]
        const hadiahPerRonde = Math.floor(diffData.hadiahTotal / RONDE)

        activeGames[gameKey] = {
            sender,
            chat,
            diff          : sub,
            ronde         : 1,
            benar         : 0,
            hadiahPerRonde,
            hadiahDapat   : 0,
            jawaban       : null,
            answered      : false,
            timer         : null,
            hintTimer     : null,
            hint          : ''
        }

        await m.reply(
            `${divider()}\n` +
            `🎮 *MINIGAME DIMULAI!*\n` +
            `${divider()}\n\n` +
            `🎯 Kesulitan  : ${diffData.label}\n` +
            `🔄 Ronde      : ${RONDE} soal\n` +
            `⏳ Timer      : 30 detik/soal\n` +
            `💰 Max hadiah : *${fmt(diffData.hadiahTotal)} koin*\n\n` +
            `📌 *Tips:*\n` +
            `• Ketik *${usedPrefix}game hint* untuk hint\n` +
            `• Ketik *${usedPrefix}game skip* untuk skip\n\n` +
            `_Bersiap... Soal pertama dalam 2 detik!_`
        )

        setTimeout(() => mulaiRonde(conn, chat, sender), 2000)
        return
    }

    m.reply(
        `❌ Perintah tidak dikenal!\n\n` +
        `Gunakan: *${usedPrefix}game easy / medium / hard*\n` +
        `Atau ketik *${usedPrefix}game* untuk menu`
    )
}

// ─────────────────────────────────────────────────────────
//  HANDLER.ALL — cek jawaban dari semua pesan masuk
// ─────────────────────────────────────────────────────────
handler.all = async function (m) {
    const conn    = this
    const sender  = m.sender
    const chat    = m.chat
    const gameKey = `${chat}_${sender}`
    const game    = activeGames[gameKey]

    if (!game || game.answered) return
    if (!m.text) return
    // Harus reply ke pesan soal
    if (!m.quoted || m.quoted.id !== game.soalMsgId) return

    const jawab = m.text.trim().toLowerCase()
    const benar = game.jawaban?.toLowerCase()

    if (jawab !== benar) {
        await conn.sendMessage(chat, {
            text: '❌ *Salah!* Coba lagi...'
        }, { quoted: m }).catch(() => {})
        return
    }

    clearTimeout(game.timer)
    clearTimeout(game.hintTimer)
    game.answered    = true
    game.benar++
    game.hadiahDapat += game.hadiahPerRonde
    game.ronde++

    const next = game.ronde > RONDE

    await conn.sendMessage(chat, {
        text:
            `✅ *BENAR!*\n\n` +
            `💰 *+${fmt(game.hadiahPerRonde)} koin*\n` +
            `📊 Total sejauh ini: *${fmt(game.hadiahDapat)} koin*\n\n` +
            `${next ? '🏁 Semua ronde selesai!' : `⏭️ Lanjut ronde ${game.ronde}...`}`
    }).catch(() => {})

    if (next) selesaiGame(conn, chat, sender)
    else setTimeout(() => mulaiRonde(conn, chat, sender), 2000)
}

// ─────────────────────────────────────────────────────────
//  METADATA
// ─────────────────────────────────────────────────────────
handler.help     = ['game [easy/medium/hard]', 'minigame']
handler.tags     = ['game']
handler.command  = /^(game|minigame)$/i
handler.owner    = false
handler.premium  = false
handler.admin    = false
handler.group    = false
handler.private  = false
handler.register = true
handler.exp      = 0
handler.limit    = false

module.exports = handler
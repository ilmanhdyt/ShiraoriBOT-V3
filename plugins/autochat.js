// plugins/autochat.js
// Auto kirim pesan selamat pagi setiap hari jam 07:00 WITA (UTC+8)
// ke grup target yang sudah dikonfigurasi di bawah.
//
// Tidak butuh library cron — pakai setInterval setiap menit.
// Interval dimulai sekali saja lewat handler.before pertama kali diload.

// ─── KONFIGURASI ────────────────────────────────────────────────
const SCHEDULE = [
    {
        // Jam & menit dalam WITA (UTC+8)
        jam    : 7,
        menit  : 0,
        // JID grup tujuan
        target : '6283102255420-1624004958@g.us',
        pesan  :
            `🌸 *Ohayou minna-san~*\n\n` +
            `Selamat pagi semuanya ✨\n` +
            `Semoga harinya menyenangkan dan penuh keberuntungan 🍀\n\n` +
            `🎮 Jangan lupa main game di bot\n` +
            `🪙 Kumpulkan hadiah dan tingkatkan petualangan kalian\n` +
            `📚 Ketik *.menu* untuk melihat semua fitur yang tersedia\n\n` +
            `Semangat menjalani aktivitas hari ini yaa 💖`
    }
]

// ─── STATE ──────────────────────────────────────────────────────
// Simpan tanggal terakhir tiap schedule agar tidak kirim 2x dalam 1 hari
const lastSent = {}   // key: `${jam}:${menit}:${target}` → 'YYYY-MM-DD'

// Flag agar setInterval hanya dibuat sekali walau plugin di-reload
let schedulerStarted = false

// ─── HELPER: tanggal WITA saat ini ──────────────────────────────
function getNowWITA() {
    // WITA = UTC+8 = UTC + 8 * 60 * 60 * 1000
    const now      = new Date()
    const utcMs    = now.getTime() + now.getTimezoneOffset() * 60000
    const witaMs   = utcMs + 8 * 3600000
    const wita     = new Date(witaMs)
    return {
        jam   : wita.getHours(),
        menit : wita.getMinutes(),
        // Format YYYY-MM-DD sebagai key unique per hari
        hari  : wita.toISOString().slice(0, 10)
    }
}

// ─── SCHEDULER ──────────────────────────────────────────────────
function startScheduler(conn) {
    if (schedulerStarted) return
    schedulerStarted = true

    console.log('[AUTOCHAT] Scheduler dimulai — cek setiap menit')

    setInterval(async () => {
        try {
            const { jam, menit, hari } = getNowWITA()

            for (const s of SCHEDULE) {
                if (s.jam !== jam || s.menit !== menit) continue

                const key = `${s.jam}:${s.menit}:${s.target}`
                if (lastSent[key] === hari) continue   // sudah kirim hari ini

                lastSent[key] = hari

                // Gunakan conn aktif saat ini (global.conn bisa berubah saat reconnect)
                const activeConn = global.conn || conn
                if (!activeConn) {
                    console.log('[AUTOCHAT] conn tidak tersedia, skip')
                    continue
                }

                await activeConn.sendMessage(s.target, { text: s.pesan })
                    .then(() => console.log(`[AUTOCHAT] ✓ Pesan terkirim ke ${s.target} jam ${s.jam}:${String(s.menit).padStart(2,'0')} WITA`))
                    .catch(e => console.log(`[AUTOCHAT] ✗ Gagal kirim: ${e.message}`))
            }
        } catch (e) {
            console.log('[AUTOCHAT] Error scheduler:', e.message)
        }
    }, 60_000)   // cek tiap 60 detik
}

// ─── COMMAND .autochat ──────────────────────────────────────────
// .autochat        → lihat jadwal aktif
// .autochat test   → kirim pesan sekarang (owner only, untuk test)

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
    const sub = (args[0] || '').toLowerCase()

    if (sub === 'test') {
        if (!isOwner) return m.reply('❌ Hanya owner yang bisa test autochat.')

        await m.reply('⏳ Mengirim pesan test...')
        for (const s of SCHEDULE) {
            await conn.sendMessage(s.target, { text: s.pesan })
                .then(() => m.reply(`✅ Terkirim ke:\n${s.target}`))
                .catch(e => m.reply(`❌ Gagal: ${e.message}`))
        }
        return
    }

    // Default: tampilkan jadwal
    let teks = `⏰ *Jadwal Auto Chat*\n${'─'.repeat(25)}\n\n`
    SCHEDULE.forEach((s, i) => {
        const key      = `${s.jam}:${s.menit}:${s.target}`
        const terakhir = lastSent[key] || 'Belum pernah'
        teks +=
            `*${i + 1}.* Jam ${String(s.jam).padStart(2,'0')}:${String(s.menit).padStart(2,'0')} WITA\n` +
            `   📍 Target : \`${s.target}\`\n` +
            `   📅 Terakhir kirim: ${terakhir}\n\n`
    })
    teks += `_Gunakan *${usedPrefix}autochat test* untuk kirim sekarang (owner)_`
    return m.reply(teks)
}

// ─── BEFORE HOOK — jalankan scheduler saat plugin pertama diload ─

// ─── METADATA ───────────────────────────────────────────────────
handler.help     = ['autochat']
handler.tags     = ['owner']
handler.command  = /^autochat$/i
handler.owner    = false
handler.premium  = false
handler.admin    = false
handler.group    = false
handler.private  = false
handler.register = false
handler.exp      = 0
handler.limit    = false

module.exports = handler

setTimeout(() => {
    startScheduler(global.conn)
}, 10_000)

// ─── AUTO RELOAD ────────────────────────────────────────────────
const _file  = require.resolve(__filename)
const _fs    = require('fs')
_fs.watchFile(_file, () => {
    _fs.unwatchFile(_file)
    schedulerStarted = false   // reset flag agar scheduler bisa restart
    delete require.cache[_file]
    if (global.reloadHandler) global.reloadHandler()
})

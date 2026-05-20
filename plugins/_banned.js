// _banned.js - Middleware: cek banned + antispam auto-ban 5 menit
// Taruh di: plugins/_banned.js

// ── Konfigurasi Antispam ──────────────────────────────────────────
const SPAM_LIMIT   = 5              // maksimal X command dalam...
const SPAM_WINDOW  = 5000           // ...5 detik (ms)
const BAN_DURATION = 5 * 60 * 1000 // durasi ban = 5 menit (ms)

// ── Tracker spam per user (in-memory, reset tiap restart) ─────────
const spamTracker = new Map()
// format: Map<num, { count, firstTime, warned }>

// ── Auto-unban scheduler ──────────────────────────────────────────
const unbanTimers = new Map()

function scheduleUnban(num, ms) {
    if (unbanTimers.has(num)) clearTimeout(unbanTimers.get(num))

    const timer = setTimeout(async () => {
        try {
            const user = global.db?.data?.users?.[num]
            if (!user || !user.banned) return
            if (user.banReason !== 'Kamu spam command bot') return

            user.banned    = false
            user.banReason = ''
            user.banTime   = 0
            user.banBy     = ''

            await global.db.write()
            unbanTimers.delete(num)
            console.log(`[ANTISPAM] ✅ Auto-unban: ${num}`)
        } catch (e) {
            console.error('[ANTISPAM] Error auto-unban:', e.message)
        }
    }, ms)

    unbanTimers.set(num, timer)
}

exports.all = async function (m) {
    try {
        if (!m.sender) return
        if (m.fromMe)  return

        const num       = m.sender.split('@')[0].split(':')[0]
        const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
        if (ownerNums.includes(num)) return  // owner bebas

        // Deteksi apakah pesan adalah command
        const _prefix = global.prefix instanceof RegExp
            ? global.prefix
            : new RegExp('^[.!/]')
        const isCommand = _prefix.test(m.text || '')

        const user = global.db?.data?.users?.[num]

        // ════════════════════════════════════════════
        //  CEK BANNED
        // ════════════════════════════════════════════
        if (user?.banned) {
            if (!isCommand) return  // tidak spam notif ke non-command

            const alasan  = user.banReason || 'Tidak ada alasan'
            const isTemp  = alasan === 'Kamu spam command bot'
            let sisaWaktu = ''

            if (isTemp && user.banTime > 0) {
                const sisa = Math.max(0, (user.banTime + BAN_DURATION) - Date.now())
                if (sisa <= 0) {
                    // Waktu habis tapi timer belum jalan — unban langsung
                    user.banned    = false
                    user.banReason = ''
                    user.banTime   = 0
                    await global.db.write()
                    // Lanjut ke antispam tracker di bawah
                } else {
                    const mnt = Math.floor(sisa / 60000)
                    const dtk = Math.floor((sisa % 60000) / 1000)
                    sisaWaktu = `\n⏳ *Sisa ban:* ${mnt} menit ${dtk} detik`

                    // Pastikan timer berjalan (misal setelah restart)
                    if (!unbanTimers.has(num)) scheduleUnban(num, sisa)

                    await this.sendMessage(m.chat, {
                        text:
                            `🚫 *Kamu telah di-BAN!*\n\n` +
                            `📌 *Alasan:* ${alasan}` +
                            sisaWaktu +
                            `\n\nHubungi owner jika merasa ini kesalahan.`
                    }, { quoted: m })
                    return
                }
            } else if (user.banned) {
                // Ban permanen (dari owner manual)
                await this.sendMessage(m.chat, {
                    text:
                        `🚫 *Kamu telah di-BAN oleh Owner!*\n\n` +
                        `📌 *Alasan:* ${alasan}\n\n` +
                        `Hubungi owner jika merasa ini kesalahan.`
                }, { quoted: m })
                return
            }
        }

        // ════════════════════════════════════════════
        //  ANTISPAM TRACKER
        // ════════════════════════════════════════════
        if (!isCommand) return  // hanya track command

        const now   = Date.now()
        let   track = spamTracker.get(num)

        // Reset jika window sudah lewat
        if (!track || (now - track.firstTime) > SPAM_WINDOW) {
            spamTracker.set(num, { count: 1, firstTime: now, warned: false })
            return
        }

        track.count++

        // Warning sebelum ban
        if (track.count === SPAM_LIMIT - 1 && !track.warned) {
            track.warned = true
            await this.sendMessage(m.chat, {
                text:
                    `⚠️ *Peringatan Spam!*\n\n` +
                    `Kamu terlalu cepat mengirim command.\n` +
                    `Berhenti sekarang atau akan di-ban otomatis ${BAN_DURATION / 60000} menit!`
            }, { quoted: m })
            return
        }

        // Ban otomatis
        if (track.count >= SPAM_LIMIT) {
            spamTracker.delete(num)

            if (!global.db.data.users)      global.db.data.users = {}
            if (!global.db.data.users[num]) global.db.data.users[num] = {}

            const dbUser     = global.db.data.users[num]
            dbUser.banned    = true
            dbUser.banReason = 'Kamu spam command bot'
            dbUser.banTime   = now
            dbUser.banBy     = 'system'

            await global.db.write()
            scheduleUnban(num, BAN_DURATION)

            const menit = BAN_DURATION / 60000
            console.log(`[ANTISPAM] 🔨 Auto-ban ${menit}m: ${num}`)

            await this.sendMessage(m.chat, {
                text:
                    `🔨 *Kamu di-BAN Otomatis!*\n\n` +
                    `📌 *Alasan:* Kamu spam command bot\n` +
                    `⏳ *Durasi:* ${menit} menit\n\n` +
                    `Kamu akan otomatis di-unban setelah ${menit} menit.\n` +
                    `Jangan spam ya! 😤`
            }, { quoted: m })
        }

    } catch (e) {
        console.error('[_banned] Error:', e.message)
    }
}

exports.disabled = false
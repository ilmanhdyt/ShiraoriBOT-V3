// plugins/_antitoxic.js
// Anti-Toxic global: aktif jika global.opts['antiToxic'] === true ATAU chat.antiToxic === true
// Warn user max 3x, lebih dari 3 → ban permanen dari bot

// ── Daftar kata toxic (tambah sesuai kebutuhan) ──────────────────────────
const TOXIC_WORDS = [
    // Makian umum
    'anjing', 'ajg', 'bangsat', 'bgs', 'b4ngsat',
    'kontol', 'kntl', 'k0ntol', 'memek', 'mmk', 'pepek', 'jancok', 'kampret', 'keparat', 'bajingan',
    'brengsek', 't0lol', 'g0blok', 'idiot',
    'babi', 'b4bi', 'monyet', 'monyong', 'setan', 'iblis', 'sialan',
    'asu', 'a5u', 'celeng',
    'perek', 'sundal', 'lonte', 'lonti', 'jalang', 'pelacur',
    'brengsek', 'bedebah',
    // Singkatan/leetspeak umum
    'wtf', 'stfu', 'kys', 'fck', 'fuk',
]

// Buat regex sekali saja agar efisien
const TOXIC_REGEX = new RegExp(
    TOXIC_WORDS.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
    'i'
)

const MAX_WARN = 3

// ── Cek apakah teks mengandung kata toxic ────────────────────────────────
function isToxic(text) {
    if (!text || typeof text !== 'string') return false
    // Bersihkan spasi berlebih & karakter zero-width
    const clean = text.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
                      .replace(/\s+/g, ' ')
                      .trim()
    return TOXIC_REGEX.test(clean)
}

exports.all = async function (m) {
    try {
        // Skip pesan dari bot sendiri
        if (!m.sender || m.fromMe) return

        // ── Cek apakah antitoxic aktif ───────────────────────────────────
        const chatData   = global.db?.data?.chats?.[m.chat]
        const globalOn   = global.opts?.['antiToxic'] === true
        const chatOn     = chatData?.antiToxic === true

        // Jika owner matikan global via DM → bypass sepenuhnya, abaikan chatOn
        if (global.opts?.['antiToxic'] === false &&
            global.db?.data?.settings?.antiToxic === false) return

        if (!globalOn && !chatOn) return

        // ── Cek teks pesan (dipindahkan ke atas untuk optimasi performa) ─
        const text = m.text || m.body || ''
        if (!text || !isToxic(text)) return

        // ── Skip owner & admin ───────────────────────────────────────────
        const senderNum  = (m.sender || '').split('@')[0].split(':')[0]
        const ownerNums  = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
        if (ownerNums.includes(senderNum)) return  // owner kebal

        // OPTIMIZED: ambil groupMetadata SEKALI saja, pakai untuk cek admin user + bot
        let _groupMetaCached = null
        const _getGroupMeta = async () => {
            if (_groupMetaCached === null && m.isGroup) {
                _groupMetaCached = await this.groupMetadata(m.chat).catch(() => false)
            }
            return _groupMetaCached || null
        }

        // Skip admin grup jika antitoxic hanya per-chat (bukan global)
        // Jika global, admin tetap kena warn
        if (!globalOn && m.isGroup) {
            try {
                const groupMeta = await _getGroupMeta()
                const isAdmin   = groupMeta?.participants
                    ?.find(p => p.id.split('@')[0].split(':')[0] === senderNum)
                    ?.admin
                if (isAdmin) return
            } catch (_) {}
        }

        // ── Cek apakah bot adalah admin grup (reuse cached metadata) ─────
        let botIsAdmin = false
        if (m.isGroup) {
            try {
                const botJid    = this.user?.jid || this.user?.id || ''
                const botNum    = botJid.split('@')[0].split(':')[0]
                const groupMeta = await _getGroupMeta()
                botIsAdmin      = !!(groupMeta?.participants
                    ?.find(p => p.id.split('@')[0].split(':')[0] === botNum)
                    ?.admin)
            } catch (_) {}
        }

        // ── Hapus pesan toxic (hanya jika bot admin) ─────────────────────
        let deleted = false
        if (botIsAdmin || !m.isGroup) {
            try {
                await this.sendMessage(m.chat, { delete: m.key })
                deleted = true
            } catch (_) {}
        }

        // Label untuk pesan warn — beda teks jika tidak bisa hapus
        const deletedNote = deleted
            ? `🗑️ Pesan kamu telah dihapus.`
            : `⚠️ _(Bot bukan admin, pesan tidak bisa dihapus)_`

        // ── Ambil / buat data user di DB ─────────────────────────────────
        if (!global.db.data.users)            global.db.data.users = {}
        if (!global.db.data.users[senderNum]) global.db.data.users[senderNum] = {}

        const user = global.db.data.users[senderNum]

        // Inisialisasi field warn toxic (terpisah dari user.warn umum)
        if (!Number.isFinite(user.toxicWarn)) user.toxicWarn = 0

        user.toxicWarn++
        const warnCount = user.toxicWarn
        const sisaWarn  = MAX_WARN - warnCount

        await global.db.write()

        // ── Sudah melewati batas: BAN ────────────────────────────────────
        if (warnCount > MAX_WARN) {
            // Sudah di-ban sebelumnya, tidak perlu kirim notif lagi
            if (user.banned && user.banReason === 'Konten toxic/kasar berulang') return

            user.banned    = true
            user.banReason = 'Konten toxic/kasar berulang'
            user.banTime   = Date.now()
            user.banBy     = 'system'
            await global.db.write()

            const targetJid = senderNum + '@s.whatsapp.net'

            await this.sendMessage(m.chat, {
                text:
                    `🔨 *AUTO-BAN: Anti-Toxic*\n\n` +
                    `@${senderNum} telah di-*BAN* karena mengirim konten toxic/kasar lebih dari *${MAX_WARN}x*.\n\n` +
                    `📌 *Alasan:* Konten toxic/kasar berulang\n` +
                    `🚫 User tidak bisa memakai bot sampai di-unban owner.`
            }, { mentions: [targetJid] })

            // DM user yang di-ban
            try {
                await this.sendMessage(targetJid, {
                    text:
                        `🚫 *Kamu telah di-BAN otomatis!*\n\n` +
                        `📌 *Alasan:* Mengirim konten toxic/kasar sebanyak ${warnCount}x.\n` +
                        `Hubungi owner jika ingin di-unban.`
                })
            } catch (_) {}

            console.log(`[ANTITOXIC] 🔨 Auto-ban: ${senderNum} (${warnCount} warn)`)
            return
        }

        // ── Tepat MAX_WARN: warn terakhir sebelum ban ────────────────────
        if (warnCount === MAX_WARN) {
            const targetJid = senderNum + '@s.whatsapp.net'
            await this.sendMessage(m.chat, {
                text:
                    `⚠️ *PERINGATAN TERAKHIR! [${warnCount}/${MAX_WARN}]*\n\n` +
                    `@${senderNum}, ini adalah peringatan *terakhir* kamu.\n` +
                    `Jika masih mengirim konten toxic, kamu akan di-*BAN permanen* dari bot!\n\n` +
                    deletedNote
            }, { mentions: [targetJid] })
            return
        }

        // ── Warn biasa (1 s/d MAX_WARN-1) ───────────────────────────────
        const targetJid = senderNum + '@s.whatsapp.net'
        await this.sendMessage(m.chat, {
            text:
                `⚠️ *PERINGATAN Anti-Toxic [${warnCount}/${MAX_WARN}]*\n\n` +
                `@${senderNum}, kamu mengirim konten yang tidak pantas!\n` +
                deletedNote + `\n\n` +
                `📢 Sisa peringatan: *${sisaWarn}x* lagi sebelum di-BAN.\n` +
                `Jaga bahasa ya! 🙏`
        }, { mentions: [targetJid] })

    } catch (e) {
        console.error('[_antitoxic] Error:', e?.message || String(e))
    }
}

// Reset toxicWarn user tertentu (bisa dipanggil dari command lain jika perlu)
exports.resetWarn = function (senderNum) {
    if (!global.db?.data?.users?.[senderNum]) return
    global.db.data.users[senderNum].toxicWarn = 0
    global.db.write().catch(() => {})
}

exports.disabled = false
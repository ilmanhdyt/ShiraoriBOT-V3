// plugins/_mentionguard.js
// Guard untuk @lid yang di-tag pakai command:
// - Belum daftar      → reply "belum daftar"
// - Sudah daftar tapi belum setlid → reply "database belum dikonfirmasi"
// - Sudah setlid      → lanjut normal

let handler = m => m

const { jidToNum, getDbUser, displayForJid } = require('../lib/jidUtils')
const findUser = require('../lib/findUser')

function getLidMentions(mentionedJid = []) {
    return mentionedJid.filter(jid => typeof jid === 'string' && jid.endsWith('@lid'))
}

handler.before = async function (m, { conn, participants = [] }) {
    if (!m || !m.mentionedJid?.length) return true
    if (m.isBaileys || m.key?.fromMe) return true
    if (!m.text) return true
    const lidMentions = getLidMentions(m.mentionedJid)
    if (!lidMentions.length) return true

    const pfx = global.prefix instanceof RegExp ? '.' :
                Array.isArray(global.prefix) ? global.prefix[0] :
                global.prefix || '.'
    if (typeof m.text !== 'string' || !m.text.startsWith(pfx)) return true

    const lidMap    = global.db.data?.settings?.lidMap || {}
    const users     = global.db.data?.users || {}
    const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
    const ownerJid  = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
    const ownerTag  = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'

    for (const tagged of lidMentions) {
        const lidNum = tagged.split('@')[0]

        // ── 1. Cek mapping valid di lidMap ──────────────────────────────
        const mapped = lidMap[tagged]
        const mappedNum = mapped ? jidToNum(mapped) : ''
        const mappedUser = mappedNum ? getDbUser(mappedNum) : null
        if (mappedNum && mappedNum !== lidNum && mappedUser?.registered) {
            continue
        }

        // ── 2. Gunakan findUser untuk resolusi LID yang robust ───────────
        //     findUser mendukung: direct DB lookup, participants-based LID
        //     matching, dan contact name matching.
        let foundJid  = null
        let foundUser = null

        const result = findUser(tagged, participants, conn)
        if (result?.user) {
            foundJid  = result.jid
            foundUser = result.user
        }

        // ── 3. Fallback: cari via field lid/lidJid yang tersimpan di DB ──
        if (!foundJid) {
            for (const [key, data] of Object.entries(users)) {
                if (key.endsWith('@g.us')) continue
                if (data?.lid === tagged || data?.lidJid === tagged) {
                    foundJid = key
                    foundUser = data
                    if (!global.db.data.settings) global.db.data.settings = {}
                    if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                    global.db.data.settings.lidMap[tagged] = jidToNum(key)
                    global.db.write().catch(() => {})
                    break
                }
            }
        }

        // ── 4. Auto-save ke lidMap jika user ditemukan & terdaftar ──────
        if (foundJid && foundUser?.registered) {
            const resolvedNum = jidToNum(foundJid)
            if (resolvedNum && lidMap[tagged] !== resolvedNum) {
                if (!global.db.data.settings) global.db.data.settings = {}
                if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                global.db.data.settings.lidMap[tagged] = resolvedNum
                global.db.write().catch(() => {})
            }
            continue
        }

        const mentions = ownerJid ? [ownerJid] : []

        if (!foundUser || !foundUser.registered) {
            // ── Belum daftar ─────────────────────────────────────────────
            await conn.sendMessage(m.chat, {
                text:
                    `⚠️ Pengguna belum terdaftar di database.\n\n` +
                    `Silakan ketik *.daftar <nama>.<umur>* untuk mendaftar.`,
                mentions: []
            }, { quoted: m }).catch(() => {})
            return false
        }

        // ── Sudah daftar tapi LID belum di-setlid ────────────────────────
        const nama = displayForJid(foundJid) || foundUser.name || lidNum
        await conn.sendMessage(m.chat, {
            text:
                `⚠️ Database *${nama}* belum dikonfirmasi oleh owner.\n\n` +
                `Hubungi ${ownerTag} untuk mengonfirmasinya.`,
            mentions
        }, { quoted: m }).catch(() => {})

        return false
    }

    return true
}

handler.command  = false
handler.disabled = false

module.exports = handler

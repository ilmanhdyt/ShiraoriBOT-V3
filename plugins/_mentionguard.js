// plugins/_mentionguard.js
// Guard untuk @lid yang di-tag pakai command:
// - Belum daftar      → reply "belum daftar"
// - Sudah daftar tapi belum setlid → reply "database belum dikonfirmasi"
// - Sudah setlid      → lanjut normal

let handler = m => m

const { jidToNum, getDbUser, displayForJid } = require('../lib/jidUtils')

function getLidMentions(mentionedJid = []) {
    return mentionedJid.filter(jid => typeof jid === 'string' && jid.endsWith('@lid'))
}

handler.before = async function (m, { conn }) {
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

        // ── 2. Cari by nomor (spekulatif: lidNum = noWA) ─────────────────
        let foundJid  = null
        let foundUser = null
        for (const [key, data] of Object.entries(users)) {
            if (!(!key.endsWith('@g.us') && key.length > 5)) continue
            if (key.split('@')[0].split(':')[0] === lidNum) {
                foundJid  = key
                foundUser = data
                break
            }
        }

        // ── 3. Cari via lidMap reverse ───────────────────────────────────
        if (!foundJid && mappedNum && users[mappedNum]) {
            foundJid  = mappedNum
            foundUser = users[mappedNum]
        }

        // ── 3b. Cari via field lid/lidJid yang sudah tersimpan ──────────────
        let confirmedByStoredLid = false
        if (!foundJid) {
            for (const [key, data] of Object.entries(users)) {
                if (!(!key.endsWith('@g.us') && key.length > 5)) continue
                if (data?.lid === tagged || data?.lidJid === tagged) {
                    foundJid = key
                    foundUser = data
                    if (!global.db.data.settings) global.db.data.settings = {}
                    if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                    global.db.data.settings.lidMap[tagged] = jidToNum(key)
                    global.db.write().catch(() => {})
                    confirmedByStoredLid = true
                    break
                }
            }
        }

        if (confirmedByStoredLid && foundUser?.registered) continue

        // ── 4. Cari via pushName (conn.contacts menyimpan nama display) ──
        if (!foundJid) {
            try {
                const contact = conn.contacts && conn.contacts[tagged]
                const lidName = (contact?.name || contact?.notify || '').trim().toLowerCase()
                if (lidName) {
                    for (const [key, data] of Object.entries(users)) {
                        if (!(!key.endsWith('@g.us') && key.length > 5)) continue
                        if (!data?.registered) continue
                        const dbName = (data.name || '').trim().toLowerCase()
                        if (dbName && dbName === lidName) {
                            foundJid  = key
                            foundUser = data
                            // Auto-simpan ke lidMap
                            if (!global.db.data.settings) global.db.data.settings = {}
                            if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                            global.db.data.settings.lidMap[tagged] = jidToNum(key)
                            global.db.write().catch(() => {})
                            break
                        }
                    }
                }
            } catch (_) {}
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

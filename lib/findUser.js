// lib/findUser.js v6
// Resolve JID/nomor/reply/mention ke user database.
// Tidak mengubah isi database user; hanya fallback lookup runtime.

const { jidToNum } = require('./jidUtils')

function findUserByNormalizedNumber(users, input) {
    if (!users || !input) return null

    const normalized = jidToNum(input)
    if (!normalized) return null

    if (users[normalized]) {
        return { user: users[normalized], jid: normalized }
    }

    for (const [key, user] of Object.entries(users)) {
        if (!user) continue
        if (jidToNum(key) === normalized) {
            return { user, jid: key }
        }
    }

    return null
}

function findUser(jid, participants = [], conn = null) {
    if (!jid) return null

    const users = global.db?.data?.users || {}

    // 1. Lookup langsung by nomor ternormalisasi atau key legacy yang cocok.
    const direct = findUserByNormalizedNumber(users, jid)
    if (direct) return direct

    // 2. Kalau @lid, coba cocokkan ke participants grup.
    if (typeof jid === 'string' && jid.endsWith('@lid') && participants.length) {
        for (const participant of participants) {
            const pRaw = typeof participant === 'string' ? participant : (participant.id || '')
            if (!pRaw || pRaw.endsWith('@lid')) continue

            const pLid = typeof participant === 'object' && participant.lid
                ? (typeof participant.lid === 'string' ? participant.lid : `${participant.lid.user}@lid`)
                : null

            if (pLid && (pLid === jid || pLid.split('@')[0] === jid.split('@')[0])) {
                const found = findUserByNormalizedNumber(users, pRaw)
                if (found?.user) return found
            }
        }

        // Fallback heuristik: participant pertama yang nomornya cocok dengan data DB.
        for (const participant of participants) {
            const pRaw = typeof participant === 'string' ? participant : (participant.id || '')
            if (!pRaw || pRaw.endsWith('@lid') || !pRaw.endsWith('@s.whatsapp.net')) continue

            const found = findUserByNormalizedNumber(users, pRaw)
            if (found?.user) return found
        }
    }

    // 3. @lid via nama kontak jika tersedia.
    if (typeof jid === 'string' && jid.endsWith('@lid') && conn?.contacts) {
        const contact = conn.contacts[jid]
        const lidName = (contact?.notify || contact?.name || '').trim().toLowerCase()

        if (lidName) {
            for (const [key, user] of Object.entries(users)) {
                if (!user?.registered || !user?.name) continue
                if (user.name.trim().toLowerCase() === lidName) {
                    return { user, jid: key }
                }
            }
        }
    }

    return null
}

module.exports = findUser

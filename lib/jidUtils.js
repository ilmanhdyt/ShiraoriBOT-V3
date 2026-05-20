// lib/jidUtils.js  — atexovi-baileys compatible
// ═══════════════════════════════════════════════════════════════════
//  Utilitas konversi JID ↔ Nomor HP
//  ‣ Semua key user di DB pakai NOMOR HP (contoh: "6281234567890")
//  ‣ Group key tetap pakai @g.us
//  ‣ lidMap di settings menyimpan: "@lid" → "nomor"
//
//  atexovi-baileys notes:
//  ‣ API sama dengan @whiskeysockets/baileys
//  ‣ mentionedJid bisa berupa @lid (WA Business) — gunakan jidToNum()
//  ‣ Gunakan normalizeMention() untuk resolve mention ke DB key
// ═══════════════════════════════════════════════════════════════════

function isAllowedPhoneNumber(num) {
    return typeof num === 'string' && /^6281\d+$/.test(num)
}
function looksLikeWaNumber(num) {
    return typeof num === 'string' && /^62\d{8,15}$/.test(num)
}

function extractNumericKey(value) {
    if (!value || typeof value !== 'string') return ''
    return value.includes('@')
        ? value.split('@')[0].split(':')[0]
        : value
}

function pickBetterUserData(current, incoming) {
    if (!current) return incoming
    if (!incoming) return current

    const currentScore =
        (current.registered ? 1000 : 0) +
        (current.name ? 100 : 0) +
        Number(current.level || 0) +
        Number(current.exp || 0) / 1000

    const incomingScore =
        (incoming.registered ? 1000 : 0) +
        (incoming.name ? 100 : 0) +
        Number(incoming.level || 0) +
        Number(incoming.exp || 0) / 1000

    return incomingScore >= currentScore
        ? { ...current, ...incoming }
        : { ...incoming, ...current }
}

function sanitizeDatabaseState(data = global.db?.data) {
    if (!data || typeof data !== 'object') return { changed: false, usersRemoved: 0, chatsRemoved: 0, lidMapRemoved: 0 }

    if (!data.users) data.users = {}
    if (!data.chats) data.chats = {}
    if (!data.settings) data.settings = {}

    let usersRemoved = 0
    let chatsRemoved = 0
    let lidMapRemoved = 0
    let changed = false

    const sanitizedUsers = {}
    for (const [key, value] of Object.entries(data.users || {})) {
        const normalized = extractNumericKey(key)
        if (!isAllowedPhoneNumber(normalized)) {
            usersRemoved++
            changed = true
            continue
        }
        sanitizedUsers[normalized] = pickBetterUserData(sanitizedUsers[normalized], value)
        if (normalized !== key) changed = true
    }
    data.users = sanitizedUsers

    const sanitizedChats = {}
    for (const [key, value] of Object.entries(data.chats || {})) {
        if (typeof key === 'string' && key.endsWith('@g.us')) {
            sanitizedChats[key] = value
            continue
        }
        const normalized = extractNumericKey(key)
        if (!isAllowedPhoneNumber(normalized)) {
            chatsRemoved++
            changed = true
            continue
        }
        sanitizedChats[normalized] = value
        if (normalized !== key) changed = true
    }
    data.chats = sanitizedChats

    const lidMap = data.settings.lidMap || {}
    const sanitizedLidMap = {}
    for (const [lid, mapped] of Object.entries(lidMap)) {
        const normalized = extractNumericKey(mapped)
        if (!lid.endsWith('@lid') || !isAllowedPhoneNumber(normalized)) {
            lidMapRemoved++
            changed = true
            continue
        }
        sanitizedLidMap[lid] = normalized
        if (normalized !== mapped) changed = true
    }
    data.settings.lidMap = sanitizedLidMap

    return { changed, usersRemoved, chatsRemoved, lidMapRemoved }
}

/**
 * FIX: syncLegacyUserKey — pindahkan data user dari key lama ke key baru (nomor)
 * Sebelumnya tidak menyimpan ke DB setelah memindahkan, sehingga
 * setelah restart atau reload DB, data hilang dan user dianggap belum daftar.
 *
 * @param {string} originalJid - JID asli (bisa @s.whatsapp.net, @lid, dll)
 * @param {string} normalizedNum - nomor HP hasil normalisasi (key baru)
 */
function syncLegacyUserKey(originalJid, normalizedNum) {
    try {
        const users = global.db?.data?.users
        if (!users || !normalizedNum || !isAllowedPhoneNumber(normalizedNum)) return

        const candidates = []
        if (originalJid) candidates.push(originalJid)

        if (typeof originalJid === 'string' && originalJid.includes('@')) {
            candidates.push(originalJid.split('@')[0])
            candidates.push(originalJid.split('@')[0].split(':')[0])
        }

        let migrated = false

        for (const candidate of candidates) {
            if (!candidate || !users[candidate]) continue
            const candidateUser = users[candidate]
            if (!users[normalizedNum]) {
                users[normalizedNum] = candidateUser
            } else {
                users[normalizedNum] = pickBetterUserData(users[normalizedNum], candidateUser)
            }
            if (candidate !== normalizedNum) delete users[candidate]
            migrated = true
            break
        }

        if (!migrated) {
            for (const [key, value] of Object.entries(users)) {
                if (!value) continue
                const keyNum = key.includes('@')
                    ? key.split('@')[0].split(':')[0]
                    : key

                if (keyNum === normalizedNum && key !== normalizedNum) {
                    if (!users[normalizedNum]) {
                        users[normalizedNum] = value
                    } else {
                        users[normalizedNum] = pickBetterUserData(users[normalizedNum], value)
                    }
                    delete users[key]
                    migrated = true
                    break
                }
            }
        }

        if (migrated && global.db?.write) {
            global.db.write().catch(() => {})
        }
    } catch (_) {}
}

/**
 * Konversi JID format apapun ke nomor HP (string murni)
 *
 * Contoh konversi:
 *   "6281234567890@s.whatsapp.net"  → "6281234567890"
 *   "6281234567890:5@s.whatsapp.net"→ "6281234567890"
 *   "174354348@lid"                  → lookup lidMap, atau "174354348"
 *   "120363@g.us"                    → "120363@g.us"  (grup, tidak diubah)
 *   "6281234567890"                  → "6281234567890" (sudah nomor)
 *
 * @param {string} jid
 * @returns {string}
 */
function jidToNum(jid) {
    if (!jid) return jid

    // Sudah angka murni (tidak ada @)
    if (!jid.includes('@')) {
        syncLegacyUserKey(jid, jid)
        return jid
    }

    // Grup — kembalikan apa adanya
    if (jid.endsWith('@g.us')) return jid

    // @lid — coba resolve via lidMap
    if (jid.endsWith('@lid')) {
        try {
            const lidMap = global.db?.data?.settings?.lidMap
            if (lidMap?.[jid]) {
                const mapped = lidMap[jid]
                // Jika mapped masih JID (legacy), convert dulu
                const normalized = mapped.includes('@') ? mapped.split('@')[0].split(':')[0] : mapped
                syncLegacyUserKey(mapped, normalized)
                return normalized
            }
        } catch (_) {}
        try {
            const users = global.db?.data?.users || {}
            for (const [key, user] of Object.entries(users)) {
                if (!user) continue
                if (user.lid === jid || user.lidJid === jid) {
                    const normalized = extractNumericKey(key)
                    syncLegacyUserKey(key, normalized)
                    return normalized
                }
            }
        } catch (_) {}
        // Jangan fallback ke angka LID mentah agar tidak tersimpan sebagai user DB key.
        // Hanya izinkan jika angka tersebut benar-benar terlihat seperti nomor WA.
        const normalized = jid.split('@')[0]
        if (looksLikeWaNumber(normalized)) {
            syncLegacyUserKey(jid, normalized)
            return normalized
        }
        return ''
    }

    // @s.whatsapp.net atau format lain
    const normalized = jid.split('@')[0].split(':')[0]
    syncLegacyUserKey(jid, normalized)
    return normalized
}

/**
 * Konversi nomor HP ke JID @s.whatsapp.net
 * Berguna untuk mengirim pesan lewat Baileys API
 *
 * @param {string} num - nomor HP atau JID
 * @returns {string}
 */
function numToJid(num) {
    if (!num) return num
    if (num.includes('@')) return num
    return num + '@s.whatsapp.net'
}

/**
 * Tentukan key yang dipakai untuk menyimpan data CHAT di DB
 *   ‣ Grup        → tetap JID @g.us
 *   ‣ DM / @lid   → nomor HP
 *
 * @param {string} jid
 * @returns {string}
 */
function chatKey(jid) {
    if (!jid) return jid
    if (jid.endsWith('@g.us')) return jid
    return jidToNum(jid)
}


/**
 * Normalisasi mentionedJid dari pesan WhatsApp
 * Resolve @lid → nomor HP via lidMap, atau strip @s.whatsapp.net
 * Kembalikan array nomor HP yang bisa dipakai sebagai DB key
 *
 * @param {string[]} mentionedJid - array dari m.mentionedJid
 * @returns {string[]} array nomor HP
 */
function normalizeMentions(mentionedJid = []) {
    if (!Array.isArray(mentionedJid)) return []
    return mentionedJid.map(jid => jidToNum(jid)).filter(Boolean)
}

/**
 * FIX: Ambil user dari DB berdasarkan JID (format apapun)
 * Sebelumnya hanya lookup by exact key, sekarang juga cek semua
 * format alternatif JID agar tidak miss user yang sudah daftar.
 *
 * @param {string} jid
 * @returns {object|null} user object atau null
 */
function getDbUser(jid) {
    try {
        const users = global.db?.data?.users || {}

        const key = jidToNum(jid)
        if (users[key]) return users[key]

        const variants = new Set([key])
        if (typeof jid === 'string') {
            variants.add(jid)
            if (jid.includes('@')) {
                variants.add(jid.split('@')[0])
                variants.add(jid.split('@')[0].split(':')[0])
            }
        }

        for (const v of variants) {
            if (users[v]) {
                if (v !== key) {
                    users[key] = users[key] ? pickBetterUserData(users[key], users[v]) : users[v]
                    delete users[v]
                    if (global.db?.write) global.db.write().catch(() => {})
                }
                return users[key]
            }
        }

        for (const [legacyKey, user] of Object.entries(users)) {
            if (!user) continue
            const legacyNum = legacyKey.includes('@')
                ? legacyKey.split('@')[0].split(':')[0]
                : legacyKey
            if (legacyNum === key) {
                users[key] = users[key] ? pickBetterUserData(users[key], user) : user
                if (legacyKey !== key) {
                    delete users[legacyKey]
                    if (global.db?.write) global.db.write().catch(() => {})
                }
                return users[key]
            }
        }

        if (typeof jid === 'string' && jid.endsWith('@lid')) {
            for (const [legacyKey, user] of Object.entries(users)) {
                if (!user) continue
                if (user.lid === jid || user.lidJid === jid) {
                    const normalized = extractNumericKey(legacyKey)
                    if (normalized !== legacyKey && isAllowedPhoneNumber(normalized)) {
                        users[normalized] = users[normalized] ? pickBetterUserData(users[normalized], user) : user
                        delete users[legacyKey]
                        if (global.db?.write) global.db.write().catch(() => {})
                        return users[normalized]
                    }
                    return user
                }
            }
        }

        return null
    } catch (_) { return null }
}

function resolveUserIdentity(sender) {
    const number = jidToNum(sender)
    const user = getDbUser(sender)
    if (user?.registered && user?.name) return String(user.name)
    return number
}

function getUserKey(sender) {
    const number = jidToNum(sender)
    const user = getDbUser(sender)
    if (user?.registered && user?.name) return String(user.name).toLowerCase()
    return number
}

/**
 * Set / update user di DB berdasarkan JID (format apapun)
 * Auto-create jika belum ada
 *
 * @param {string} jid
 * @param {object} data - field yang akan di-merge
 * @returns {object} user object setelah update
 */
function setDbUser(jid, data = {}) {
    try {
        const key = jidToNum(jid)
        if (!global.db.data.users) global.db.data.users = {}
        const existing = getDbUser(jid)
        if (existing) {
            Object.assign(existing, data)
            return existing
        }
        global.db.data.users[key] = {}
        Object.assign(global.db.data.users[key], data)
        return global.db.data.users[key]
    } catch (_) { return {} }
}

/**
 * Pastikan user ada di DB — buat entry default jika belum
 * Safe untuk dipanggil di setiap handler tanpa risk crash
 *
 * @param {string} jid
 * @param {object} defaults - nilai default untuk field baru
 * @returns {object} user object
 */
function ensureDbUser(jid, defaults = {}) {
    try {
        const key = jidToNum(jid)
        if (!global.db.data.users) global.db.data.users = {}
        const existing = getDbUser(jid)
        if (existing) {
            Object.assign(existing, defaults)
            return existing
        }
        if (!global.db.data.users[key]) {
            global.db.data.users[key] = {
                exp: 0,
                level: 1,
                money: 0,
                registered: false,
                name: '',
                ...defaults
            }
        }
        return global.db.data.users[key]
    } catch (_) { return {} }
}

module.exports = {
    jidToNum,
    numToJid,
    chatKey,
    normalizeMentions,
    getDbUser,
    setDbUser,
    ensureDbUser,
    resolveUserIdentity,
    getUserKey,
    sanitizeDatabaseState,
    isAllowedPhoneNumber,
}

/**
 * Return preferred display for a JID: registered name (if present) else phone number.
 * If neither is available, return empty string (so callers can avoid showing raw @lid).
 * @param {string} jid
 * @returns {string}
 */
function displayForJid(jid) {
    try {
        const user = getDbUser(jid)
        if (user && user.registered && user.name) return String(user.name)
        const num = jidToNum(jid)
        if (isAllowedPhoneNumber(num)) return num
        return ''
    } catch (_) { return '' }
}

module.exports.displayForJid = displayForJid

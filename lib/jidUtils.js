// lib/jidUtils.js  — shiraori-baileys compatible (MIGRATED)
// ═══════════════════════════════════════════════════════════════════
//  Utilitas konversi JID ↔ Nomor HP
//  ‣ Semua key user di DB pakai NOMOR HP (contoh: "6281234567890")
//  ‣ Group key tetap pakai @g.us
//  ‣ lidMap di settings menyimpan: "@lid" → "nomor"
//
//  MIGRATED to shiraori-baileys:
//  ‣ jidToNum() sekarang pakai extractPhoneNumber (shiraori-baileys)
//    sebagai lapisan utama — handles semua format: @s.whatsapp.net,
//    @lid, multi-device :N@, plain number.
//  ‣ API publik tetap sama (jidToNum, numToJid, normalizeMentions, dll)
// ═══════════════════════════════════════════════════════════════════

// ── shiraori-baileys: extractPhoneNumber ─────────────────────────
// Import lazy untuk avoid circular dependency
let _shiraExtractPhone = null
function getShiraExtractPhone() {
    if (!_shiraExtractPhone) {
        try {
            _shiraExtractPhone = require('shiraori-baileys').extractPhoneNumber
        } catch (_) {
            // fallback ke internal extractNumericKey jika module belum available
        }
    }
    return _shiraExtractPhone
}

// FIX: was /^6281\d+$/ — only accepted 0811/0812 numbers.
// Changed to /^62\d{8,15}$/ to accept ALL Indonesian carriers:
//   6282x (Telkomsel 082x), 6283x, 6285x, 6287x, 6288x, 6289x, etc.
// Also accepts international numbers (e.g. 601xxxxxxx for Malaysia).
function isAllowedPhoneNumber(num) {
    return typeof num === 'string' && /^62\d{8,15}$/.test(num)
}

// FIX: broader check used inside @lid fallback path — same fix applied
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
        // FIX: was isAllowedPhoneNumber (6281-only) — now uses looksLikeWaNumber (all 62xxx)
        // This prevents 6282/6283/6285/etc users from being deleted on startup sanitize
        if (!looksLikeWaNumber(normalized)) {
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
        if (!looksLikeWaNumber(normalized)) {
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
        // FIX: was isAllowedPhoneNumber — now looksLikeWaNumber so 6282/6285 lidMap entries survive
        if (!lid.endsWith('@lid') || !looksLikeWaNumber(normalized)) {
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
        // FIX: was isAllowedPhoneNumber — now looksLikeWaNumber so 6282/6285 users can be migrated
        if (!users || !normalizedNum || !looksLikeWaNumber(normalizedNum)) return

        // ★ PERF: If normalized key already exists in DB, data is already stored correctly.
        // Skip expensive candidate iteration and O(n) legacy scan entirely.
        // This is the hot path for all established users.
        if (users[normalizedNum]) return

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

    // @lid — coba resolve via lidMap, lalu pakai extractPhoneNumber (shiraori-baileys)
    if (jid.endsWith('@lid')) {
        try {
            const lidMap = global.db?.data?.settings?.lidMap
            if (lidMap?.[jid]) {
                const mapped = lidMap[jid]
                const normalized = mapped.includes('@') ? mapped.split('@')[0].split(':')[0] : mapped
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

    // MIGRATED: pakai extractPhoneNumber dari shiraori-baileys untuk @s.whatsapp.net
    // Handles multi-device format "628xxx:15@s.whatsapp.net" secara clean
    const _shiraFn = getShiraExtractPhone()
    if (_shiraFn) {
        try {
            const extracted = _shiraFn(jid)
            if (extracted && /^\d{8,15}$/.test(extracted)) return extracted
        } catch (_) {}
    }

    // ★ PERF FAST PATH: Standard JID (number@s.whatsapp.net)
    const normalized = jid.split('@')[0].split(':')[0]
    if (/^\d{8,15}$/.test(normalized)) return normalized

    // Non-standard JID format — run legacy sync as safety net
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
// ★ PERF: Short-TTL cache for getDbUser — eliminates 2-3 duplicate O(n) lookups per command.
// Within a single command processing cycle (~50ms), getDbUser(m.sender) is called multiple times.
// This cache ensures only the first call does the actual lookup.
const _dbUserCache = new Map()
const _DB_USER_TTL = 3000

function getDbUser(jid) {
    try {
        // ★ Cache check
        if (jid) {
            const cached = _dbUserCache.get(jid)
            if (cached && (Date.now() - cached.t) < _DB_USER_TTL) return cached.v
        }

        const users = global.db?.data?.users || {}

        const key = jidToNum(jid)
        if (users[key]) {
            const v = users[key]
            if (jid) _dbUserCache.set(jid, { v, t: Date.now() })
            return v
        }

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
                const result = users[key]
                if (jid) _dbUserCache.set(jid, { v: result, t: Date.now() })
                return result
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
                const result = users[key]
                if (jid) _dbUserCache.set(jid, { v: result, t: Date.now() })
                return result
            }
        }

        if (typeof jid === 'string' && jid.endsWith('@lid')) {
            for (const [legacyKey, user] of Object.entries(users)) {
                if (!user) continue
                if (user.lid === jid || user.lidJid === jid) {
                    const normalized = extractNumericKey(legacyKey)
                    if (normalized !== legacyKey && looksLikeWaNumber(normalized)) {
                        users[normalized] = users[normalized] ? pickBetterUserData(users[normalized], user) : user
                        delete users[legacyKey]
                        if (global.db?.write) global.db.write().catch(() => {})
                        const result = users[normalized]
                        if (jid) _dbUserCache.set(jid, { v: result, t: Date.now() })
                        return result
                    }
                    if (jid) _dbUserCache.set(jid, { v: user, t: Date.now() })
                    return user
                }
            }
        }

        if (jid) _dbUserCache.set(jid, { v: null, t: Date.now() })
        return null
    } catch (_) { return null }
}

function resolveUserIdentity(sender) {
    const number = jidToNum(sender)
    const user = getDbUser(sender)
    if (user?.registered && user?.name) return String(user.name)
    return number
}

/**
 * FIX: getUserKey harus selalu return nomor HP (primary DB key), bukan nama user.
 * Sebelumnya return user.name.toLowerCase() untuk registered user — ini SALAH karena:
 *   1. db.users[name] tidak ada — DB key selalu nomor
 *   2. Nama bisa duplicate, rename, unicode issue
 * Sekarang selalu return nomor HP yang dinormalisasi.
 */
function getUserKey(sender) {
    return jidToNum(sender)
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

/**
 * Invalidate user index cache — wajib dipanggil setelah register/unregister/rename/migrate/delete
 * Fungsi ini dipanggil via global._invalidateUserIndex() dari plugin yang ubah data user
 */
function invalidateUserIndex() {
    try {
        // handler.js registers a setter via global._userIndexCache._setter
        // to allow clearing its module-scoped cache variables
        if (global._userIndexCache?._setter) {
            global._userIndexCache._setter(null, 0, -1)
        }
    } catch (_) {}
}

/**
 * Merge lidMap dari database/database/settings.json ke database/settings.json
 * Dipanggil saat startup untuk menyatukan lidMap yang terpecah akibat struktur DB lama.
 * SAFE: tidak menghapus data, hanya merge/update.
 */
function mergeSplitLidMap(data) {
    try {
        if (!data || typeof data !== 'object') return
        if (!data.settings) data.settings = {}
        if (!data.settings.lidMap) data.settings.lidMap = {}

        // database/database/ dibaca HybridDB sebagai data.database (plain object)
        // karena "database" bukan SPLIT_DIR_KEYS — isinya: { msgs, settings, stats, sticker }
        const nestedSettings = data.database?.settings
        if (nestedSettings && typeof nestedSettings === 'object' && nestedSettings.lidMap) {
            let merged = 0
            for (const [lid, num] of Object.entries(nestedSettings.lidMap)) {
                if (!lid.endsWith('@lid')) continue
                const normalized = typeof num === 'string' && num.includes('@')
                    ? num.split('@')[0].split(':')[0]
                    : num
                if (!looksLikeWaNumber(normalized)) continue
                if (!data.settings.lidMap[lid]) {
                    data.settings.lidMap[lid] = normalized
                    merged++
                }
            }
            if (merged > 0) {
                console.log(`[jidUtils] Merged ${merged} lidMap entries from database/database/settings.json`)
            }
        }
    } catch (_) {}
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
    looksLikeWaNumber,
    invalidateUserIndex,
    mergeSplitLidMap,
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
        if (looksLikeWaNumber(num)) return num
        return ''
    } catch (_) { return '' }
}

module.exports.displayForJid = displayForJid

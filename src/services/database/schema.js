// src/services/database/schema.js
// Default values dan normalisasi untuk struktur DB ShiraoriBOT
//
// TUJUAN:
//   - Mencegah undefined/null access di plugin
//   - Satu sumber kebenaran untuk default values
//   - Mempermudah migrasi schema di masa depan

'use strict'

/**
 * @typedef {Object} User
 * @property {boolean} registered
 * @property {string}  name
 * @property {number}  money
 * @property {number}  bank
 * @property {number}  exp
 * @property {number}  level
 * @property {number}  health
 * @property {number}  lastSeen
 * @property {Object}  inventory
 * @property {number}  dailyStreak
 * @property {string}  lastDaily
 * @property {string}  role
 */
const USER_DEFAULTS = Object.freeze({
    registered:   false,
    name:         '',
    money:        0,
    bank:         0,
    exp:          0,
    level:        1,
    health:       100,
    lastSeen:     0,
    inventory:    {},
    dailyStreak:  0,
    lastDaily:    '',
    role:         'user',
    premium:      false,
    premiumExpiry: 0,
    banned:       false,
    bannedReason: '',
    afk:          -1,
    afkReason:    '',
    married:      false,
    marriedWith:  '',
    lastTransfer: 0,
    warn:         0,
    limit:        10,
})

/**
 * @typedef {Object} ChatSettings
 * @property {boolean} antispam
 * @property {boolean} antilink
 * @property {boolean} welcome
 * @property {boolean} detect
 * @property {boolean} sewa
 * @property {number}  expired
 */
const CHAT_DEFAULTS = Object.freeze({
    antispam:  false,
    antilink:  false,
    antinsfw:  false,
    welcome:   false,
    detect:    false,
    sewa:      false,
    expired:   0,
    game:      false,
})

/**
 * @typedef {Object} GlobalSettings
 * @property {boolean} self
 * @property {boolean} autoread
 * @property {boolean} restrict
 * @property {Object}  lidMap
 */
const SETTINGS_DEFAULTS = Object.freeze({
    self:      false,
    autoread:  false,
    restrict:  false,
    mading:    false,
    jadibotMode: false,
    lidMap:    {},
})

/**
 * Normalize user object dengan default values.
 * Tidak menghapus key yang sudah ada.
 * @param {Partial<User>} data
 * @returns {User}
 */
function normalizeUser(data = {}) {
    const result = { ...USER_DEFAULTS }
    for (const key of Object.keys(data)) {
        if (data[key] !== undefined && data[key] !== null) {
            result[key] = data[key]
        }
    }
    // Pastikan inventory selalu object
    if (!result.inventory || typeof result.inventory !== 'object' || Array.isArray(result.inventory)) {
        result.inventory = {}
    }
    return result
}

/**
 * Normalize chat settings dengan default values.
 * @param {Partial<ChatSettings>} data
 * @returns {ChatSettings}
 */
function normalizeChat(data = {}) {
    return { ...CHAT_DEFAULTS, ...data }
}

/**
 * Normalize global settings dengan default values.
 * @param {Partial<GlobalSettings>} data
 * @returns {GlobalSettings}
 */
function normalizeSettings(data = {}) {
    return {
        ...SETTINGS_DEFAULTS,
        ...data,
        lidMap: (data.lidMap && typeof data.lidMap === 'object') ? data.lidMap : {},
    }
}

/**
 * Validasi dan bersihkan user object dari nilai tidak valid.
 * @param {Object} user
 * @returns {boolean} apakah ada perbaikan yang dilakukan
 */
function sanitizeUser(user) {
    if (!user || typeof user !== 'object') return false
    let changed = false

    // Pastikan nilai numerik tidak negatif tidak masuk akal
    for (const key of ['money', 'bank', 'exp', 'level', 'health']) {
        if (typeof user[key] !== 'number' || isNaN(user[key])) {
            user[key] = USER_DEFAULTS[key]
            changed = true
        }
        if (user[key] < 0 && key !== 'health') {
            user[key] = 0
            changed = true
        }
    }

    // level minimum 1
    if (user.level < 1) { user.level = 1; changed = true }

    // inventory harus object
    if (!user.inventory || typeof user.inventory !== 'object') {
        user.inventory = {}
        changed = true
    }

    return changed
}

module.exports = {
    USER_DEFAULTS,
    CHAT_DEFAULTS,
    SETTINGS_DEFAULTS,
    normalizeUser,
    normalizeChat,
    normalizeSettings,
    sanitizeUser,
}

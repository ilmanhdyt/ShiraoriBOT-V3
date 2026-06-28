// src/services/database/index.js
// DatabaseService — wrapper tipis di atas global.db
//
// PRINSIP:
//   - global.db TIDAK dihapus. Plugin lama tetap jalan.
//   - Service ini adalah ADDITIVE layer.
//   - Plugin baru bisa pakai service ini alih-alih akses global langsung.
//   - Semua write tetap pakai db.write() yang sudah di-debounce di main.js.

'use strict'

const { normalizeUser, normalizeChat, normalizeSettings, sanitizeUser } = require('./schema')

class DatabaseService {
    /**
     * @param {import('../../..').Low} db — instance global.db
     */
    constructor(db) {
        if (!db) throw new Error('DatabaseService: db instance wajib diisi')
        this._db = db
    }

    // ── Raw access (untuk backward compat internal) ─────────────────
    get raw() { return this._db }
    get data() { return this._db.data }

    // ── Write — tetap pakai yang sudah ada di main.js (debounced) ───
    write() {
        return this._db.write()
    }

    // ─────────────────────────────────────────────────────────────────
    // USER
    // ─────────────────────────────────────────────────────────────────

    /**
     * Ambil user. Return null jika tidak ada.
     * @param {string} id — JID atau nomor
     * @returns {Object|null}
     */
    getUser(id) {
        const users = this._db.data?.users
        if (!users || !id) return null
        const user = users[id]
        if (!user) return null
        return normalizeUser(user)
    }

    /**
     * Ambil user, buat jika belum ada.
     * Mengembalikan referensi LANGSUNG ke data (bukan copy).
     * Ini penting agar mutation oleh plugin lama tetap jalan.
     * @param {string} id
     * @returns {Object}
     */
    ensureUser(id) {
        if (!this._db.data.users) this._db.data.users = {}
        if (!this._db.data.users[id]) {
            this._db.data.users[id] = normalizeUser({})
        }
        return this._db.data.users[id]
    }

    /**
     * Cek apakah user ada.
     * @param {string} id
     * @returns {boolean}
     */
    hasUser(id) {
        return !!(this._db.data?.users?.[id])
    }

    /**
     * Update user dengan partial data.
     * @param {string} id
     * @param {Object} patch
     * @returns {Object} user setelah update
     */
    updateUser(id, patch) {
        const user = this.ensureUser(id)
        Object.assign(user, patch)
        return user
    }

    /**
     * Tambah/kurangi money user.
     * @param {string} id
     * @param {number} amount — bisa negatif
     * @returns {number} balance baru
     */
    addMoney(id, amount) {
        const user = this.ensureUser(id)
        user.money = Math.max(0, (user.money || 0) + amount)
        return user.money
    }

    /**
     * Kurangi money jika cukup.
     * @param {string} id
     * @param {number} amount
     * @returns {{ success: boolean, balance: number }}
     */
    deductMoney(id, amount) {
        const user = this.ensureUser(id)
        const current = user.money || 0
        if (current < amount) return { success: false, balance: current }
        user.money = current - amount
        return { success: true, balance: user.money }
    }

    /**
     * Tambah EXP, return apakah level up.
     * @param {string} id
     * @param {number} exp
     * @returns {{ leveled: boolean, oldLevel: number, newLevel: number }}
     */
    addExp(id, exp) {
        const user   = this.ensureUser(id)
        const mult   = global.multiplier || 69
        const oldLvl = user.level || 1
        user.exp     = (user.exp || 0) + exp

        // Hitung level baru (sama dengan formula existing)
        let newLvl = oldLvl
        while (user.exp >= mult * newLvl * newLvl) {
            newLvl++
        }
        user.level = newLvl

        return { leveled: newLvl > oldLvl, oldLevel: oldLvl, newLevel: newLvl }
    }

    /**
     * Ambil semua user.
     * @returns {Object}
     */
    getAllUsers() {
        return this._db.data?.users || {}
    }

    // ─────────────────────────────────────────────────────────────────
    // CHAT / GRUP
    // ─────────────────────────────────────────────────────────────────

    /**
     * @param {string} chatId
     * @returns {Object|null}
     */
    getChat(chatId) {
        const chats = this._db.data?.chats
        if (!chats || !chatId) return null
        return chats[chatId] ? normalizeChat(chats[chatId]) : null
    }

    /**
     * @param {string} chatId
     * @returns {Object}
     */
    ensureChat(chatId) {
        if (!this._db.data.chats) this._db.data.chats = {}
        if (!this._db.data.chats[chatId]) {
            this._db.data.chats[chatId] = normalizeChat({})
        }
        return this._db.data.chats[chatId]
    }

    /**
     * @param {string} chatId
     * @param {Object} patch
     * @returns {Object}
     */
    updateChat(chatId, patch) {
        const chat = this.ensureChat(chatId)
        Object.assign(chat, patch)
        return chat
    }

    // ─────────────────────────────────────────────────────────────────
    // SETTINGS
    // ─────────────────────────────────────────────────────────────────

    /**
     * Ambil global settings (normalized).
     * @returns {Object}
     */
    getSettings() {
        return normalizeSettings(this._db.data?.settings || {})
    }

    /**
     * Update global settings.
     * @param {Object} patch
     */
    updateSettings(patch) {
        if (!this._db.data.settings) this._db.data.settings = {}
        Object.assign(this._db.data.settings, patch)
    }

    // ─────────────────────────────────────────────────────────────────
    // LID MAP (WhatsApp LID ↔ JID mapping)
    // ─────────────────────────────────────────────────────────────────

    getLidMap() {
        return this._db.data?.settings?.lidMap || {}
    }

    setLidEntry(lid, jid) {
        if (!this._db.data.settings) this._db.data.settings = {}
        if (!this._db.data.settings.lidMap) this._db.data.settings.lidMap = {}
        this._db.data.settings.lidMap[lid] = jid
    }

    getLidEntry(lid) {
        return this._db.data?.settings?.lidMap?.[lid] || null
    }

    // ─────────────────────────────────────────────────────────────────
    // MAINTENANCE
    // ─────────────────────────────────────────────────────────────────

    /**
     * Sanitize semua user data (perbaiki nilai rusak).
     * Jalankan saat startup atau secara berkala.
     * @returns {{ fixed: number, total: number }}
     */
    sanitizeAllUsers() {
        const users = this._db.data?.users
        if (!users) return { fixed: 0, total: 0 }
        let fixed = 0
        const total = Object.keys(users).length
        for (const user of Object.values(users)) {
            if (sanitizeUser(user)) fixed++
        }
        return { fixed, total }
    }

    /**
     * Sanitize satu user saja (untuk hot path per-pesan).
     * Jauh lebih efisien daripada sanitizeAllUsers() di setiap pesan.
     * @param {Object} user - object user dari db.data.users[key]
     * @returns {boolean} true jika ada nilai yang diperbaiki
     */
    sanitizeUser(user) {
        if (!user || typeof user !== 'object') return false
        return sanitizeUser(user)
    }
}

module.exports = { DatabaseService }

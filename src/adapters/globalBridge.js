// src/adapters/globalBridge.js
// Jembatan backward compatibility: global.db tetap ada, tapi sekarang
// ada shortcut tambahan yang lebih bersih di global scope.
//
// PENTING: Ini ADDITIVE. Tidak menghapus apapun yang sudah ada.
//          Plugin lama pakai global.db.data.users[id] → tetap jalan.
//          Plugin baru bisa pakai global.getUser(id) atau context.services.db
//
// CARA INSTALL (di main.js, setelah global.db siap):
//
//   const { installGlobalBridge } = require('./src/adapters/globalBridge')
//   const { DatabaseService }     = require('./src/services/database')
//
//   // Setelah: global.db = new Low(...)
//   const dbService = new DatabaseService(global.db)
//   installGlobalBridge(dbService)

'use strict'

/**
 * @param {import('../services/database').DatabaseService} dbService
 */
function installGlobalBridge(dbService) {
    if (!dbService) throw new Error('globalBridge: dbService wajib diisi')

    // Expose service ke global untuk plugin yang ingin adopt bertahap
    global.dbService = dbService

    // ── Shortcut DB yang lebih bersih ──────────────────────────────
    // Plugin lama tetap pakai global.db.data.users[id] → tidak berubah
    // Plugin baru bisa pakai shortcut ini

    /**
     * Ambil user (normalized copy). Return null jika tidak ada.
     * @param {string} id
     * @returns {Object|null}
     */
    global.getUser = (id) => dbService.getUser(id)

    /**
     * Pastikan user ada, buat jika belum. Return referensi langsung.
     * @param {string} id
     * @returns {Object}
     */
    global.ensureUser = (id) => dbService.ensureUser(id)

    /**
     * Update user dengan partial data.
     * @param {string} id
     * @param {Object} patch
     * @returns {Object}
     */
    global.updateUser = (id, patch) => dbService.updateUser(id, patch)

    /**
     * Tambah money (bisa negatif untuk kurangi).
     * @param {string} id
     * @param {number} amount
     * @returns {number} balance baru
     */
    global.addMoney = (id, amount) => dbService.addMoney(id, amount)

    /**
     * Kurangi money jika cukup.
     * @param {string} id
     * @param {number} amount
     * @returns {{ success: boolean, balance: number }}
     */
    global.deductMoney = (id, amount) => dbService.deductMoney(id, amount)

    /**
     * Tambah EXP, return info level up.
     * @param {string} id
     * @param {number} exp
     * @returns {{ leveled: boolean, oldLevel: number, newLevel: number }}
     */
    global.addExp = (id, exp) => dbService.addExp(id, exp)

    /**
     * Tulis DB (debounced, pakai yang sudah ada di main.js).
     * @returns {Promise<void>}
     */
    global.saveDb = () => dbService.write()
}

/**
 * Cabut semua shortcut yang dipasang oleh installGlobalBridge.
 * Berguna untuk test atau cleanup.
 */
function uninstallGlobalBridge() {
    delete global.dbService
    delete global.getUser
    delete global.ensureUser
    delete global.updateUser
    delete global.addMoney
    delete global.deductMoney
    delete global.addExp
    delete global.saveDb
}

module.exports = { installGlobalBridge, uninstallGlobalBridge }

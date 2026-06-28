// src/core/context.js
// Context object yang dikirim ke plugin sebagai parameter kedua.

'use strict'

// Load queue and scheduler architectures
require('./queue')
require('./scheduler')

/**
 * Build context object untuk dikirim ke plugin.
 *
 * @param {Object} options
 * @param {Object} options.conn               — Baileys socket / conn instance
 * @param {Object} [options.groupMetaCache]   — NodeCache instance untuk group metadata
 * @returns {Object} context object
 */
function buildContext({ conn, groupMetaCache } = {}) {
    // Ambil services dari global (sudah diinstall oleh globalBridge)
    const db     = global.dbService || null
    const logger = (() => {
        try { return require('../services/logger').logger }
        catch (_) { return console }
    })()

    return {
        // Service layer (untuk plugin baru)
        services: {
            db,
            logger,
            cache: {
                groupMetadata: groupMetaCache || null,
            },
        },
        
        // New Refactored Architecture Additions
        queue: global.queueManager,
        scheduler: global.scheduler,

        // Shortcut logger langsung di context
        logger,
    }
}

module.exports = { buildContext }

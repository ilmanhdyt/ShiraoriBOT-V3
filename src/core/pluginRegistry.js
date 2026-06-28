// src/core/pluginRegistry.js
// Registry metadata plugin (opsional — plugin lama tidak wajib register).
//
// Plugin LAMA tetap jalan seperti biasa via handler.tags / handler.command.
// Plugin BARU bisa export `meta` object untuk fitur tambahan.
//
// CONTOH plugin baru dengan meta:
//
//   export const meta = {
//     name: 'ping',
//     tags: ['info'],
//     cooldown: 3,
//     description: 'Cek kecepatan respons bot',
//   }
//
//   export default async function handler(m, { conn, services }) { ... }

'use strict'

/**
 * @typedef {Object} PluginMeta
 * @property {string}   name
 * @property {string[]} tags
 * @property {number}   cooldown      — detik
 * @property {string}   [description]
 * @property {string}   [version]
 * @property {boolean}  [ownerOnly]
 * @property {boolean}  [premium]
 * @property {boolean}  [groupOnly]
 */

class PluginRegistry {
    constructor() {
        /** @type {Map<string, { handler: Function, meta: PluginMeta, file: string, loadedAt: number }>} */
        this._map = new Map()
    }

    /**
     * Daftarkan plugin dengan metadata.
     * Dipanggil saat plugin di-load oleh handler.
     *
     * @param {string}   name
     * @param {Function} handler
     * @param {PluginMeta} [meta]
     * @param {string}   [file]   — path file plugin
     */
    register(name, handler, meta = {}, file = '') {
        this._map.set(name, {
            handler,
            meta: {
                name:        meta.name        || name,
                tags:        meta.tags        || [],
                cooldown:    meta.cooldown    ?? 3,
                description: meta.description || '',
                version:     meta.version     || '1.0',
                ownerOnly:   meta.ownerOnly   || false,
                premium:     meta.premium     || false,
                groupOnly:   meta.groupOnly   || false,
            },
            file,
            loadedAt: Date.now(),
        })
    }

    /**
     * Hapus plugin dari registry (saat unload/reload).
     * @param {string} name
     */
    unregister(name) {
        this._map.delete(name)
    }

    /**
     * @param {string} name
     * @returns {{ handler: Function, meta: PluginMeta, file: string }|undefined}
     */
    get(name) {
        return this._map.get(name)
    }

    /**
     * Ambil semua plugin.
     * @returns {Array}
     */
    getAll() {
        return [...this._map.values()]
    }

    /**
     * Filter plugin by tag.
     * @param {string} tag
     * @returns {Array}
     */
    getByTag(tag) {
        return this.getAll().filter(p => p.meta.tags.includes(tag))
    }

    /**
     * Statistik registry untuk debug/monitoring.
     * @returns {Object}
     */
    summary() {
        const all = this.getAll()
        const byTag = {}
        for (const p of all) {
            for (const t of p.meta.tags) {
                byTag[t] = (byTag[t] || 0) + 1
            }
        }
        return {
            total:  all.length,
            byTag,
            names:  all.map(p => p.meta.name),
        }
    }
}

// Singleton
const registry = new PluginRegistry()

module.exports = { PluginRegistry, registry }

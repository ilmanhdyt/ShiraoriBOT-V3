/**
 * baileys-compat.js — Compatibility layer
 * Merges native @whiskeysockets/baileys exports with shiraori-baileys exports.
 * All project files should require() from this module instead of directly
 * requiring either library.
 */
const _shiraori = require('shiraori-baileys')
let _nativeBaileys = {}
try {
    _nativeBaileys = require('shiraori-baileys/node_modules/@whiskeysockets/baileys')
} catch (e) {
    try {
        _nativeBaileys = require('@whiskeysockets/baileys')
    } catch (err) {}
}

// Native Baileys first, then shiraori-baileys overrides on top
module.exports = { ..._nativeBaileys, ..._shiraori }

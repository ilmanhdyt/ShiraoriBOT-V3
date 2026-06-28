// src/services/logger/index.js
// StructuredLogger — drop-in replacement untuk console.log tersebar
// 
// CARA PAKAI:
//   const { logger } = require('../../src/services/logger')
//   logger.info('Bot connected')
//   logger.warn('Bad MAC detected', { count: 5, threshold: 8 })
//   logger.error('Socket error', { err: e.message })
//
//   Untuk module-level prefix:
//   const log = logger.child('SESSION')
//   log.info('Reconnecting...')   → output: "INFO [SESSION] Reconnecting..."

'use strict'

const LEVELS = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3 })
const COLORS = {
    debug: '\x1b[90m',  // grey
    info:  '\x1b[36m',  // cyan
    warn:  '\x1b[33m',  // yellow
    error: '\x1b[31m',  // red
    reset: '\x1b[0m',
}

const ENV_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()
const MIN_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info
const USE_COLOR = process.stdout.isTTY !== false && process.env.NO_COLOR == null
const USE_JSON  = process.env.LOG_FORMAT === 'json'

function pad2(n) { return String(n).padStart(2, '0') }

function timestamp() {
    const d = new Date()
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ` +
           `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

class Logger {
    /**
     * @param {string} [prefix]
     * @param {string} [parentPrefix]
     */
    constructor(prefix = '', parentPrefix = '') {
        this._prefix = prefix
        this._fullPrefix = parentPrefix ? `${parentPrefix}:${prefix}` : prefix
    }

    _write(level, msg, meta) {
        if (LEVELS[level] < MIN_LEVEL) return

        if (USE_JSON) {
            const entry = {
                ts:    new Date().toISOString(),
                level,
                msg,
                ...(this._fullPrefix ? { module: this._fullPrefix } : {}),
                ...(meta || {}),
            }
            process.stdout.write(JSON.stringify(entry) + '\n')
            return
        }

        const color  = USE_COLOR ? COLORS[level] : ''
        const reset  = USE_COLOR ? COLORS.reset : ''
        const pfx    = this._fullPrefix ? ` [${this._fullPrefix}]` : ''
        const metaStr = meta ? ' ' + JSON.stringify(meta) : ''
        const line   = `${timestamp()} ${color}${level.toUpperCase().padEnd(5)}${reset}${pfx} ${msg}${metaStr}`

        if (level === 'error') {
            process.stderr.write(line + '\n')
        } else {
            process.stdout.write(line + '\n')
        }
    }

    /** @param {string} msg @param {Object} [meta] */
    debug(msg, meta) { this._write('debug', String(msg), meta) }

    /** @param {string} msg @param {Object} [meta] */
    info(msg, meta)  { this._write('info',  String(msg), meta) }

    /** @param {string} msg @param {Object} [meta] */
    warn(msg, meta)  { this._write('warn',  String(msg), meta) }

    /** @param {string} msg @param {Object} [meta] */
    error(msg, meta) { this._write('error', String(msg), meta) }

    /**
     * Buat child logger dengan prefix tambahan.
     * @param {string} prefix
     * @returns {Logger}
     */
    child(prefix) {
        return new Logger(prefix, this._fullPrefix)
    }
}

const logger = new Logger()

module.exports = { Logger, logger }

'use strict'

/**
 * consoleForwarder.js
 * ───────────────────
 * Intercepts console.log / console.warn / console.error / console.info
 * dan kirim output ke grup WhatsApp secara real-time.
 *
 * PENGGUNAAN (di main.js, setelah global.conn tersedia):
 *
 *   const { installConsoleForwarder } = require('./lib/consoleForwarder')
 *   installConsoleForwarder('6283151212966-1584346611@g.us')
 *
 * PERINTAH BOT (via plugins/console.js):
 *   .console on      — aktifkan forwarding
 *   .console off     — matikan forwarding
 *   .console status  — cek status
 *   .console setgroup <jid> — ganti target grup (owner only)
 */

// ─── state ────────────────────────────────────────────────────────
let _enabled       = true          // default ON saat install
let _targetJid     = ''
let _sendQueue     = []
let _flushTimer    = null
let _installed     = false

// Pesan di-buffer max 2 detik agar tidak flood WA
const FLUSH_DELAY_MS  = 2000
// Batas panjang 1 pesan WA (hindari truncation)
const MAX_MSG_LEN     = 3500
// Batas baris per flush (cegah queue membesar saat bot ramai)
const MAX_LINES_PER_FLUSH = 40
// Cooldown antar kirim (ms) — hindari rate-limit WA
const SEND_COOLDOWN_MS = 500

// Label warna ANSI → emoji agar terbaca di WA
const LABEL_MAP = [
  { re: /\[FATAL\]/i,     emoji: '🔴 [FATAL]'    },
  { re: /\[ERROR\]/i,     emoji: '🔴 [ERROR]'    },
  { re: /\[WARN\]/i,      emoji: '🟡 [WARN]'     },
  { re: /\[RECONNECT\]/i, emoji: '🔄 [RECONNECT]'},
  { re: /\[KONEKSI\]/i,   emoji: '🌐 [KONEKSI]'  },
  { re: /\[SESSION\]/i,   emoji: '🔑 [SESSION]'  },
  { re: /\[HANDLER\]/i,   emoji: '⚙️ [HANDLER]'  },
  { re: /\[PLUGIN\]/i,    emoji: '🔌 [PLUGIN]'   },
  { re: /\[DB\]/i,        emoji: '💾 [DB]'        },
  { re: /\[PERF\]/i,      emoji: '📊 [PERF]'     },
  { re: /\[LID/i,         emoji: '🔗 [LID]'      },
]

// Strip ANSI escape codes
function stripAnsi(str) {
  return String(str).replace(/\x1b\[[0-9;]*m/g, '')
}

// Format args jadi string
function argsToString(args) {
  return args.map(a => {
    if (typeof a === 'string') return a
    try { return JSON.stringify(a, null, 0) } catch (_) { return String(a) }
  }).join(' ')
}

// Ganti label berwarna dengan emoji
function prettifyLabel(line) {
  for (const { re, emoji } of LABEL_MAP) {
    if (re.test(line)) {
      return line.replace(/\[[A-Z\- ]+\]/i, emoji)
    }
  }
  return line
}

// ─── flush buffer → kirim ke WA ───────────────────────────────────
let _lastSentAt = 0

async function flushQueue() {
  _flushTimer = null
  if (!_enabled || !_targetJid || !global.conn) return
  if (_sendQueue.length === 0) return

  const lines = _sendQueue.splice(0, MAX_LINES_PER_FLUSH)
  let text = lines.join('\n')

  // Potong jika terlalu panjang
  if (text.length > MAX_MSG_LEN) {
    text = text.slice(0, MAX_MSG_LEN) + '\n…(terpotong)'
  }

  // Cooldown sederhana
  const now = Date.now()
  const wait = SEND_COOLDOWN_MS - (now - _lastSentAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))

  try {
    await global.conn.sendMessage(_targetJid, { text: `\`\`\`\n${text}\n\`\`\`` })
    _lastSentAt = Date.now()
  } catch (_) {
    // Jangan sampai error saat kirim log menghancurkan bot
  }

  // Kalau masih ada sisa di queue, jadwalkan flush berikutnya
  if (_sendQueue.length > 0) {
    scheduleFlush()
  }
}

function scheduleFlush() {
  if (_flushTimer) return
  _flushTimer = setTimeout(flushQueue, FLUSH_DELAY_MS)
}

// ─── Libsignal / session noise suppressor ─────────────────────────
const SUPPRESS_PATTERNS = [
  'Bad MAC', 'bad mac', 'Session error',
  'Failed to decrypt message', 'decryptWithSessions',
  'doDecryptWhisperMessage', 'verifyMAC', 'session_cipher.js',
  'Failed to decrypt message with any known session',
  'Closing stale open session',
  'Closing session:',
  'Closing open session in favor of',
  'No sessions',
]
function isLibsignalNoise(args) {
  const str = args.map(a => typeof a === 'string' ? a : (a?.message || String(a))).join(' ')
  return SUPPRESS_PATTERNS.some(p => str.includes(p))
}

// ─── intercept console ────────────────────────────────────────────
function makePatch(original) {
  return function (...args) {
    // Suppress libsignal session noise sebelum print
    if (isLibsignalNoise(args)) return

    // Panggil console asli dulu
    original.apply(console, args)

    if (!_enabled || !_targetJid) return

    const raw  = argsToString(args)
    const line = prettifyLabel(stripAnsi(raw)).trim()
    if (!line) return

    // Filter log yang sangat spamy / tidak informatif
    const skip = [
      /^(undefined|null|true|false|\d+)$/,       // nilai primitif saja
      /writeDebounced|AUTH_SAVE|DB_WRITE/,         // internal debounce noise
      /^\[object Object\]$/,
    ]
    if (skip.some(r => r.test(line))) return

    // Tambahkan timestamp singkat
    const ts = new Date().toLocaleTimeString('id-ID', { hour12: false })
    _sendQueue.push(`[${ts}] ${line}`)
    scheduleFlush()
  }
}

// ─── publik API ───────────────────────────────────────────────────

/**
 * Pasang forwarder. Panggil SEKALI di main.js setelah import.
 * @param {string} targetJid  - JID grup tujuan, mis. 'xxx@g.us'
 * @param {boolean} [enabled] - default true
 */
function installConsoleForwarder(targetJid, enabled = true) {
  if (_installed) {
    // Cukup update target & status
    _targetJid = targetJid
    _enabled   = enabled
    return
  }
  _installed = true
  _targetJid = targetJid
  _enabled   = enabled

  const _orig = {
    log:   console.log.bind(console),
    info:  console.info.bind(console),
    warn:  console.warn.bind(console),
    error: console.error.bind(console),
  }

  // Simpan referensi original agar plugin bisa pakai juga
  global._consoleFwdOrig = _orig

  console.log   = makePatch(_orig.log)
  console.info  = makePatch(_orig.info)
  console.warn  = makePatch(_orig.warn)
  console.error = makePatch(_orig.error)

  _orig.log(`\x1b[32m[CONSOLE-FWD]\x1b[0m Aktif → ${targetJid} (enabled=${enabled})`)
}

function setEnabled(val) { _enabled = !!val }
function isEnabled()     { return _enabled }
function setTarget(jid)  { _targetJid = jid }
function getTarget()     { return _targetJid }

module.exports = {
  installConsoleForwarder,
  setEnabled,
  isEnabled,
  setTarget,
  getTarget,
}
require('./config')
require('./src/core/context') // Load the new architecture context (Queue, Scheduler)
const { installConsoleForwarder } = require('./lib/consoleForwarder')

// ═══════════════════════════════════════════════════════════════════

// ── shiraori-baileys: export utama ────────────────────────────────
const shiraBaileys = require('shiraori-baileys')

// ── Util LID dari shiraori-baileys ────────────────────────────────
const {
    extractPhoneNumber,
    extractPhoneNumberFromKey,
    extractPhoneNumberFromMessage,
    isUserJid,
    isGroupJid,
    isLidJid,
    FastMode,
} = shiraBaileys

// ── Fungsi koneksi dari shiraori-baileys ──────────────────────────
const useMultiFileAuthState = shiraBaileys.useMultiFileAuthState

// ── Baileys core (masih perlu untuk fungsi low-level) ────────────
const baileysPro = require('@whiskeysockets/baileys')
const makeWASocket              = baileysPro.default || baileysPro.makeWASocket || baileysPro
const DisconnectReason          = baileysPro.DisconnectReason
const fetchLatestBaileysVersion = baileysPro.fetchLatestBaileysVersion
const makeCacheableSignalKeyStore = baileysPro.makeCacheableSignalKeyStore
const Browsers                  = baileysPro.Browsers
const isJidStatusBroadcast      = baileysPro.isJidStatusBroadcast || ((jid = '') => jid === 'status@broadcast')
const isJidNewsletter           = baileysPro.isJidNewsletter || ((jid = '') => /@newsletter$/.test(jid))

const path        = require('path')
const fs          = require('fs')
const NodeCache   = require('node-cache')
const yargs       = require('yargs/yargs')
const _           = require('lodash')
const qrcode      = require('qrcode-terminal')
const syntaxerror = require('syntax-error')
const P           = require('pino')
const { Boom }    = require('@hapi/boom')
const { monitorEventLoopDelay, performance } = require('perf_hooks')
const readline    = require('readline')
const {
    sanitizeDatabaseState,
    isAllowedPhoneNumber,
    looksLikeWaNumber,
    mergeSplitLidMap,
    invalidateUserIndex,
} = require('./lib/jidUtils')

const useMobile     = process.argv.includes('--mobile')
let pairingNumber = ''
const DEBUG_SESSION = process.env.DEBUG_SESSION === 'true'
const QUIET_LIBSIGNAL_SESSION_LOGS = process.env.QUIET_LIBSIGNAL_SESSION_LOGS !== 'false'
const ENABLE_PERF_MONITOR = process.env.ENABLE_PERF_MONITOR !== 'false'

const { cleanupCorruptedSession } = require('./lib/sessionFix')
cleanupCorruptedSession('./session')

let simple = require('./lib/simple')

// ── FastMode Instance (global, dipakai oleh handler & plugins) ─────
// FastMode dari shiraori-baileys: queue-based sender dengan anti-spam
global.fastMode = new FastMode({
    messageDelay  : 120,   // jeda antar batch (ms)
    sameJidDelay  : 350,   // min jeda ke JID yang sama
    concurrency   : 3,     // maks send paralel
    maxQueueSize  : 500,
    debug         : false,
})

global.fastMode.on('error', (info) => {
    if (info instanceof Error) {
        console.error('\x1b[31m[FASTMODE]\x1b[0m processLoop error:', info.message)
    }
})

function fixBrokenEmojiText(text) {
    // Normalize common mojibake from UTF-8 misread as latin-1
    let s = String(text || '')
    s = s.replace(/\u00e2\u009c\u0094/g, '\u2713')      // âœ" → ✓
    s = s.replace(/\u00e2\u009c\u0085/g, '\u2705')      // âœ… → ✅
    s = s.replace(/\u00e2\u008c/g, '\u274C')             // âŒ → ❌
    s = s.replace(/\u00e2\u009a\u0020\uFE0F/g, '\u26A0\uFE0F') // âš  → ⚠️
    s = s.replace(/\u00e2\u00b3/g, '\u23F3')             // â³ → ⏳
    s = s.replace(/\u00e2\u0080\u0093/g, '\u2014')      // â€" → —
    s = s.replace(/\u00e2\u2020\u0099/g, '\u2192')      // â†' → →
    s = s.replace(/\u00e2\u0095\u00ac/g, '+')             // â•¬ → +
    s = s.replace(/\u00e2\u0095\u00a9/g, '+')             // â•© → +
    s = s.replace(/\u00e2\u0095/g, '=')                   // â• → =
    return s
}

function importLegacyUsersIntoDb(dbData) {
    try {
        const nestedUsersDir = path.join(__dirname, 'database', 'database', 'users')
        if (fs.existsSync(nestedUsersDir)) {
            if (!dbData.users || typeof dbData.users !== 'object') dbData.users = {}
            for (const file of fs.readdirSync(nestedUsersDir)) {
                if (!file.endsWith('.json')) continue
                const num = file.slice(0, -5)
                if (!/^62\d{8,15}$/.test(num)) continue
                const fullPath = path.join(nestedUsersDir, file)
                try {
                    const raw = fs.readFileSync(fullPath, 'utf8')
                    const parsed = JSON.parse(raw)
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
                    const current = dbData.users[num]
                    const currentRegistered = !!current?.registered
                    const incomingRegistered = !!parsed?.registered
                    dbData.users[num] = currentRegistered && !incomingRegistered
                        ? { ...parsed, ...current }
                        : { ...current, ...parsed }
                } catch (_) {}
            }
        }

        const legacyUsersDir = path.join(__dirname, 'database', 'users')
        if (!fs.existsSync(legacyUsersDir)) return { migrated: 0, failed: 0 }

        if (!dbData.users || typeof dbData.users !== 'object') dbData.users = {}

        let migrated = 0
        let failed = 0

        for (const file of fs.readdirSync(legacyUsersDir)) {
            if (!file.endsWith('.json')) continue
            const num = file.slice(0, -5)
            if (!looksLikeWaNumber(num)) continue
            const fullPath = path.join(legacyUsersDir, file)
            try {
                const raw = fs.readFileSync(fullPath, 'utf8')
                const parsed = JSON.parse(raw)
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
                const current = dbData.users[num]
                const currentRegistered = !!current?.registered
                const incomingRegistered = !!parsed?.registered
                dbData.users[num] = currentRegistered && !incomingRegistered
                    ? { ...parsed, ...current }
                    : { ...current, ...parsed }
                migrated++
            } catch (_) {
                failed++
            }
        }

        return { migrated, failed }
    } catch (_) {
        return { migrated: 0, failed: 0 }
    }
}

const originalConsoleInfo  = console.info.bind(console)
const originalConsoleWarn  = console.warn.bind(console)
const originalConsoleLog   = console.log.bind(console)
const originalConsoleError = console.error.bind(console)

const _originalStderrWrite = process.stderr.write.bind(process.stderr)
process.stderr.write = function (chunk, encoding, callback) {
    const str = typeof chunk === 'string' ? chunk : chunk.toString()
    if (
        str.includes('Bad MAC') ||
        str.includes('bad mac') ||
        str.includes('Session error') ||
        str.includes('Failed to decrypt message') ||
        str.includes('decryptWithSessions') ||
        str.includes('doDecryptWhisperMessage') ||
        str.includes('session_cipher.js') ||
        str.includes('verifyMAC')
    ) {
        if (typeof callback === 'function') callback()
        return true
    }
    return _originalStderrWrite(chunk, encoding, callback)
}

function shouldSuppressLibsignalSessionLog(args = []) {
    if (!QUIET_LIBSIGNAL_SESSION_LOGS || DEBUG_SESSION) return false
    const msgs = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg && typeof arg.message === 'string') return arg.message
        if (arg && typeof arg.toString === 'function') return String(arg.toString())
        return ''
    }).join(' ')

    const isBadMacMsg = msgs.includes('Bad MAC') || msgs.includes('bad mac') ||
        msgs.startsWith('Session error:') ||
        msgs.includes('Failed to decrypt message') ||
        msgs.includes('decryptWithSessions') ||
        msgs.includes('decryptWhisperMessage') ||
        msgs.includes('No sessions')

    const isSuppressed =
        msgs === 'Closing stale open session for new outgoing prekey bundle' ||
        msgs.startsWith('Closing session:') ||
        msgs.startsWith('Closing open session in favor of incoming prekey bundle') ||
        msgs.startsWith('Failed to decrypt message with any known session') ||
        isBadMacMsg

    if (isSuppressed && isBadMacMsg) {
        const now = Date.now()
        if (now - badMacLiveWindowStart > BAD_MAC_LIVE_WINDOW_MS) {
            badMacLiveCount = 0
            badMacLiveWindowStart = now
        }
        badMacLiveCount++
        if (badMacLiveCount >= BAD_MAC_LIVE_THRESHOLD) {
            badMacLiveCount = 0
            badMacLiveWindowStart = 0
            setImmediate(() => triggerLiveBadMacRecovery().catch(() => {}))
        }
    }

    return isSuppressed
}

function normalizeConsoleArgs(args = []) {
    return args.map(arg => typeof arg === 'string' ? fixBrokenEmojiText(arg) : arg)
}

console.log   = (...args) => { if (shouldSuppressLibsignalSessionLog(args)) return; originalConsoleLog(...normalizeConsoleArgs(args)) }
console.info  = (...args) => { if (shouldSuppressLibsignalSessionLog(args)) return; originalConsoleInfo(...normalizeConsoleArgs(args)) }
console.warn  = (...args) => { if (shouldSuppressLibsignalSessionLog(args)) return; originalConsoleWarn(...normalizeConsoleArgs(args)) }
console.error = (...args) => { if (shouldSuppressLibsignalSessionLog(args)) return; originalConsoleError(...normalizeConsoleArgs(args)) }
console.debug = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    if (typeof originalConsoleLog === 'function') {
        originalConsoleLog(...normalizeConsoleArgs(args))
    } else {
        originalConsoleInfo(...normalizeConsoleArgs(args))
    }
}

const { Low, JSONFile } = require('./lib/lowdb')
const mongoDB            = require('./lib/mongoDB')
const HybridDBAdapter    = require('./lib/hybridDBAdapter')

global.API = (name, p = '/', query = {}, apikeyqueryname) =>
    (name in global.APIs ? global.APIs[name] : name) +
    p +
    (query || apikeyqueryname
        ? '?' + new URLSearchParams(Object.entries({
            ...query,
            ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {}),
          }))
        : '')

global.timestamp = { start: new Date() }

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
    '^[' +
    (opts['prefix'] || '\u200exzXZ/i!#$%+\u00a3\u00a2\u20ac\u00a5^\u00b0=\u00b6\u2206\u00d7\u00f7\u03c0\u221a\u2713\u00a9\u00ae:;?&.\\-')
        .replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') +
    ']'
)

const localDbPrefix = opts._[0] ? opts._[0] + '_' : ''
const localDbRoot = localDbPrefix ? path.join('database', localDbPrefix + 'database') : 'database'
const localLegacyDbFile = path.join('database', localDbPrefix + 'database.json')

global.db = new Low(
    /https?:\/\//.test(opts['db'] || '')
        ? new cloudDBAdapter(opts['db'])
        : /mongodb/.test(opts['db'])
            ? new mongoDB(opts['db'])
            : new HybridDBAdapter(localDbRoot, { legacyFile: localLegacyDbFile })
)
global.DATABASE = global.db

const DB_WRITE_DEBOUNCE_MS    = Math.max(1000, Number(process.env.DB_WRITE_DEBOUNCE_MS || 2000))
const AUTH_SAVE_DEBOUNCE_MS   = Math.max(250,  Number(process.env.AUTH_SAVE_DEBOUNCE_MS || 1500))
const BAD_MAC_COOLDOWN_MS     = Math.max(60 * 1000, Number(process.env.BAD_MAC_COOLDOWN_MS || 2 * 60 * 1000))
const SHOULD_FETCH_LATEST_VERSION = true
const INSTANCE_LOCK_FILE = path.resolve(__dirname, '.bot-session.lock')

const rawDbWrite = global.db.write.bind(global.db)
let dbDirty          = false
let dbWriteTimer     = null
let dbWriteInFlight  = false
let dbWriteDeferred  = null
let authSaveDirty    = false
let authSaveTimer    = null
let authSaveInFlight = false
let authSaveDeferred = null
let lastBadMacCleanup      = 0
let activeSocketToken      = 0
let badMacRecoveryInFlight = false
let badMacLiveCount        = 0
let badMacLiveWindowStart  = 0
const BAD_MAC_LIVE_THRESHOLD = 3
const BAD_MAC_LIVE_WINDOW_MS = 10000
let instanceLockFd     = null
let reconnectTimer     = null
let reconnectRequested = false
let lastOpenAt         = 0
let lastBadSessionAt   = 0
let badSessionStreak   = 0
let lidSyncInFlight    = false
let lastLidSyncAt      = 0

const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, useClones: false })
const signalKeyStoreCache  = new NodeCache({ stdTTL: 10 * 60, useClones: false })
const groupMetadataCache   = new NodeCache({ stdTTL: 5 * 60,  useClones: false })

const BAD_SESSION_STREAK_WINDOW_MS = 2 * 60 * 1000
const BAD_SESSION_RECENT_OPEN_MS   = 10 * 60 * 1000
const LID_SYNC_COOLDOWN_MS         = 6 * 60 * 60 * 1000

function formatErrorBrief(err, fallback = 'unknown error') {
    if (!err) return fallback
    const message = err?.message || err?.data?.message || err?.output?.payload?.message || String(err)
    return String(message).replace(/\s+/g, ' ').slice(0, 220)
}

function isBadMacError(input) {
    return /bad mac|failed to decrypt|decryptwithsessions|decryptwhispermessage/i.test(String(input || ''))
}

function isActiveSocket(conn) {
    return !!conn && conn === global.conn && conn.__socketToken === activeSocketToken
}

function cleanupCorruptedSessionFiles() {
    if (!fs.existsSync(SESSION_DIR)) return 0
    let deleted = 0
    const walk = (dir) => {
        const files = fs.readdirSync(dir)
        for (const f of files) {
            const full = path.join(dir, f)
            const stat = fs.statSync(full)
            if (stat.isDirectory()) { walk(full); continue }
            if (f.startsWith('sender-key') || f.startsWith('session-') || f.startsWith('app-state')) {
                fs.rmSync(full, { force: true })
                deleted++
            }
            if (f.startsWith('pre-key-')) {
                try {
                    const content = fs.readFileSync(full, 'utf8')
                    JSON.parse(content)
                } catch {
                    try { fs.rmSync(full, { force: true }); deleted++ } catch {}
                }
            }
        }
    }
    walk(SESSION_DIR)
    return deleted
}

async function triggerLiveBadMacRecovery() {
    if (badMacRecoveryInFlight) return
    const now = Date.now()
    if (now - lastBadMacCleanup < BAD_MAC_COOLDOWN_MS) return
    if (!global.conn) return
    badMacRecoveryInFlight = true
    lastBadMacCleanup = now
    originalConsoleLog('\x1b[33m[SESSION]\x1b[0m Bad MAC berulang terdeteksi — auto recovery...')
    try {
        await flushAuthStateNow().catch(() => {})
        const deleted = cleanupCorruptedSessionFiles()
        resetSocketCaches({ keepRetryCounter: false })
        originalConsoleLog('\x1b[32m[SESSION]\x1b[0m ' + deleted + ' file session korup dihapus. Reconnect...')
        const oldConn = global.conn
        await destroySocket(oldConn)
        await loadAuth()
        await createSocket()
        originalConsoleLog('\x1b[32m[SESSION]\x1b[0m Auto recovery selesai ✓')
        global._lastRecoveryAt = Date.now()
        global._recoveryNotifiedChats = new Set()
    } catch (e) {
        originalConsoleLog('\x1b[31m[SESSION]\x1b[0m Auto recovery gagal: ' + formatErrorBrief(e))
        reconnectBot('bad-mac-live-recovery')
    } finally {
        badMacRecoveryInFlight = false
        badMacLiveCount = 0
    }
}

function shouldTreatBadSessionAsTransient(reason, errMsg) {
    if (reason !== DisconnectReason.badSession) return false
    const now = Date.now()
    badSessionStreak = now - lastBadSessionAt <= BAD_SESSION_STREAK_WINDOW_MS
        ? badSessionStreak + 1
        : 1
    lastBadSessionAt = now
    const diag = getSessionDiagnostics()
    const hasUsableSession = diag.creds || diag.preKeys > 0 || diag.sessions > 0 || diag.senderKeys > 0
    const openedRecently = lastOpenAt > 0 && (now - lastOpenAt) <= BAD_SESSION_RECENT_OPEN_MS
    const explicitBadSessionMessage = /bad session|session invalid|invalid session/i.test(String(errMsg || ''))
    if (!explicitBadSessionMessage) return true
    if (openedRecently) return true
    if (hasUsableSession && badSessionStreak < 3) return true
    return false
}

async function maybeSyncLidMap(conn) {
    if (lidSyncInFlight) {
        console.log('\x1b[33m[LID SYNC]\x1b[0m Sync masih berjalan. Skip trigger duplikat.')
        return
    }
    const now = Date.now()
    if (lastLidSyncAt > 0 && (now - lastLidSyncAt) < LID_SYNC_COOLDOWN_MS) {
        const waitMin = Math.ceil((LID_SYNC_COOLDOWN_MS - (now - lastLidSyncAt)) / 60000)
        console.log('\x1b[33m[LID SYNC]\x1b[0m Dilewati — baru sync. Coba lagi sekitar ' + waitMin + ' menit.')
        return
    }
    lidSyncInFlight = true
    try {
        console.log('\x1b[33m[LID SYNC]\x1b[0m Mulai sync semua grup...')
        await conn.insertAllGroup().catch(() => {})
        const count = Object.keys(global.db?.data?.settings?.lidMap || {}).length
        console.log('\x1b[32m[LID SYNC]\x1b[0m Selesai. Total lidMap: ' + count + ' entry')
        lastLidSyncAt = Date.now()
        await global.db.write().catch(() => {})
    } catch (e) {
        console.log('\x1b[31m[LID SYNC]\x1b[0m Error: ' + e.message)
    } finally {
        lidSyncInFlight = false
    }
}

function resetSocketCaches({ keepRetryCounter = true } = {}) {
    try { signalKeyStoreCache.flushAll() } catch (_) {}
    try { groupMetadataCache.flushAll() } catch (_) {}
    if (!keepRetryCounter) {
        try { msgRetryCounterCache.flushAll() } catch (_) {}
    }
}

async function destroySocket(conn) {
    if (!conn) return
    try { await flushAuthStateNow() } catch (e) {
        console.log('\x1b[31m[SESSION]\x1b[0m Flush auth sebelum tutup socket gagal: ' + formatErrorBrief(e))
    }
    try { conn.ev?.removeAllListeners?.() } catch (_) {}
    try { conn.ws?.removeAllListeners?.() } catch (_) {}
    try { conn.ws?.close?.() } catch (_) {}
    try { conn.end?.(new Error('socket refresh')) } catch (_) {}
    await new Promise(r => setTimeout(r, 300))
}

function getSessionDiagnostics() {
    if (!fs.existsSync(SESSION_DIR)) {
        return { exists: false, total: 0, senderKeys: 0, sessions: 0, appState: 0, preKeys: 0, creds: false, recent: [] }
    }
    const summary = { exists: true, total: 0, senderKeys: 0, sessions: 0, appState: 0, preKeys: 0, creds: false, recent: [] }
    const recentFiles = []
    const walk = (dir) => {
        const files = fs.readdirSync(dir)
        for (const name of files) {
            const full = path.join(dir, name)
            const stat = fs.statSync(full)
            if (stat.isDirectory()) { walk(full); continue }
            summary.total++
            if (name.startsWith('sender-key')) summary.senderKeys++
            else if (name.startsWith('session-')) summary.sessions++
            else if (name.startsWith('app-state')) summary.appState++
            else if (name.startsWith('pre-key')) summary.preKeys++
            else if (name === 'creds.json') summary.creds = true
            let mtimeMs = 0
            try { mtimeMs = stat.mtimeMs || 0 } catch (_) {}
            recentFiles.push({ name: path.relative(SESSION_DIR, full), mtimeMs })
        }
    }
    walk(SESSION_DIR)
    summary.recent = recentFiles
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, 5)
        .map(item => item.name)
    return summary
}

function logSessionDiagnostics(context) {
    try {
        const d = getSessionDiagnostics()
        console.log(
            '\x1b[36m[SESSION-DIAG]\x1b[0m ' + context +
            ' | exists=' + d.exists + ' total=' + d.total +
            ' creds=' + d.creds + ' preKeys=' + d.preKeys +
            ' sessions=' + d.sessions + ' senderKeys=' + d.senderKeys +
            ' appState=' + d.appState +
            (d.recent.length ? ' recent=' + d.recent.join(',') : '')
        )
    } catch (e) {
        console.log('\x1b[31m[SESSION-DIAG]\x1b[0m Gagal baca diagnostik: ' + formatErrorBrief(e))
    }
}

function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try { process.kill(pid, 0); return true } catch (_) { return false }
}

function releaseInstanceLock() {
    if (instanceLockFd !== null) {
        try { fs.closeSync(instanceLockFd) } catch (_) {}
        instanceLockFd = null
    }
    try {
        if (fs.existsSync(INSTANCE_LOCK_FILE)) fs.rmSync(INSTANCE_LOCK_FILE, { force: true })
    } catch (_) {}
}

function acquireInstanceLock() {
    try {
        instanceLockFd = fs.openSync(INSTANCE_LOCK_FILE, 'wx')
        fs.writeFileSync(instanceLockFd, String(process.pid))
        return true
    } catch (err) {
        if (err?.code !== 'EEXIST') throw err
    }
    try {
        const existingPid = Number(String(fs.readFileSync(INSTANCE_LOCK_FILE, 'utf8') || '').trim())
        if (existingPid === process.pid) {
            fs.rmSync(INSTANCE_LOCK_FILE, { force: true })
            instanceLockFd = fs.openSync(INSTANCE_LOCK_FILE, 'wx')
            fs.writeFileSync(instanceLockFd, String(process.pid))
            return true
        }
        if (isProcessAlive(existingPid)) {
            throw new Error('Bot instance lain masih aktif dengan PID ' + existingPid + '. Hentikan instance lama dulu.')
        }
        fs.rmSync(INSTANCE_LOCK_FILE, { force: true })
        instanceLockFd = fs.openSync(INSTANCE_LOCK_FILE, 'wx')
        fs.writeFileSync(instanceLockFd, String(process.pid))
        return true
    } catch (err) {
        if (err?.code === 'EEXIST') {
            throw new Error('Lock session sedang dipakai proses lain. Coba restart setelah instance lama berhenti.')
        }
        throw err
    }
}

function createDeferred() {
    let resolve, reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}

async function flushDatabaseNow() {
    if (!dbWriteDeferred) dbWriteDeferred = createDeferred()
    if (dbWriteTimer) { clearTimeout(dbWriteTimer); dbWriteTimer = null }
    if (dbWriteInFlight) return dbWriteDeferred.promise
    const currentDeferred = dbWriteDeferred
    if (!global.db.data || !dbDirty) {
        currentDeferred.resolve()
        if (dbWriteDeferred === currentDeferred) dbWriteDeferred = null
        return currentDeferred.promise
    }
    dbWriteInFlight = true
    try {
        do { dbDirty = false; await rawDbWrite() } while (dbDirty)
        currentDeferred.resolve()
    } catch (e) {
        dbDirty = true; currentDeferred.reject(e); throw e
    } finally {
        dbWriteInFlight = false
        if (dbWriteDeferred === currentDeferred) dbWriteDeferred = null
        if (dbDirty && !dbWriteTimer) { global.db.write().catch(() => {}) }
    }
    return currentDeferred.promise
}

async function flushAuthStateNow() {
    if (!globalSaveCreds) return
    if (!authSaveDeferred) authSaveDeferred = createDeferred()
    if (authSaveTimer) { clearTimeout(authSaveTimer); authSaveTimer = null }
    if (authSaveInFlight) return authSaveDeferred.promise
    const currentDeferred = authSaveDeferred
    if (!authSaveDirty) {
        currentDeferred.resolve()
        if (authSaveDeferred === currentDeferred) authSaveDeferred = null
        return currentDeferred.promise
    }
    authSaveInFlight = true
    try {
        do { authSaveDirty = false; await globalSaveCreds() } while (authSaveDirty)
        currentDeferred.resolve()
    } catch (e) {
        authSaveDirty = true; currentDeferred.reject(e); throw e
    } finally {
        authSaveInFlight = false
        if (authSaveDeferred === currentDeferred) authSaveDeferred = null
        if (authSaveDirty && !authSaveTimer) {
            queueAuthStateSave('retry-after-failed-flush').catch(() => {})
        }
    }
    return currentDeferred.promise
}

async function queueAuthStateSave(reason = 'unknown') {
    authSaveDirty = true
    if (!authSaveDeferred) authSaveDeferred = createDeferred()
    if (!authSaveTimer && !authSaveInFlight) {
        authSaveTimer = setTimeout(() => {
            authSaveTimer = null
            flushAuthStateNow().catch(e =>
                console.log('\x1b[31m[SESSION]\x1b[0m Flush auth error (' + reason + '): ' + formatErrorBrief(e))
            )
        }, AUTH_SAVE_DEBOUNCE_MS)
    }
    return authSaveDeferred.promise
}

global.db.write = async function writeDebounced() {
    dbDirty = true
    if (!dbWriteDeferred) dbWriteDeferred = createDeferred()
    if (!dbWriteTimer && !dbWriteInFlight) {
        dbWriteTimer = setTimeout(() => {
            dbWriteTimer = null
            flushDatabaseNow().catch(e =>
                console.log('\x1b[31m[DB]\x1b[0m Flush error: ' + e.message)
            )
        }, DB_WRITE_DEBOUNCE_MS)
    }
    return Promise.resolve()
}
global.db.writeNow = flushDatabaseNow

let lastEventLoopUtilization = performance.eventLoopUtilization()

function startPerfMonitor() {
    if (!ENABLE_PERF_MONITOR) return
    const histogram = monitorEventLoopDelay({ resolution: 20 })
    histogram.enable()
    setInterval(() => {
        try {
            const elu = performance.eventLoopUtilization(lastEventLoopUtilization)
            lastEventLoopUtilization = performance.eventLoopUtilization()
            const maxLagMs  = Number(histogram.max / 1e6).toFixed(0)
            const p95LagMs  = Number(histogram.percentile(95) / 1e6).toFixed(0)
            const memMb     = Math.round(process.memoryUsage().rss / 1024 / 1024)
            const active    = typeof process._getActiveHandles === 'function'
                ? process._getActiveHandles().length : 0
            if (Number(maxLagMs) >= 250 || elu.utilization >= 0.8) {
                console.log(
                    '\x1b[33m[PERF]\x1b[0m ' +
                    `ELU=${(elu.utilization * 100).toFixed(0)}% ` +
                    `lagP95=${p95LagMs}ms lagMax=${maxLagMs}ms ` +
                    `rss=${memMb}MB handles=${active}`
                )
            }
            histogram.reset()
        } catch (_) {}
    }, 60_000)
}

global.loadDatabase = async function loadDatabase() {
    if (global.db.READ)
        return new Promise(resolve =>
            setInterval(function () {
                if (!global.db.READ) {
                    clearInterval(this)
                    resolve(global.db.data == null ? global.loadDatabase() : global.db.data)
                }
            }, 1000)
        )
    if (global.db.data !== null) return
    global.db.READ = true
    await global.db.read()
    global.db.READ = false
    global.db.data = {
        users: {}, chats: {}, stats: {}, msgs: {}, sticker: {}, settings: {},
        country: null,
        ...(global.db.data || {}),
    }
    if (!global.db.data.country || typeof global.db.data.country !== 'object') {
        global.db.data.country = {
            president: '', vicePresident: '', police: [], treasury: 0,
            salary: { president: 50000, vicePresident: 30000, police: 10000 },
            election: { active: false, candidates: [], votes: {} },
            lastSalaryPaid: 0,
        }
    }
    const legacyImport = importLegacyUsersIntoDb(global.db.data)
    if (legacyImport.migrated || legacyImport.failed) {
        console.log(
            '\x1b[36m[DB IMPORT]\x1b[0m legacy users imported=' + legacyImport.migrated +
            ' failed=' + legacyImport.failed
        )
    }
    mergeSplitLidMap(global.db.data)
    const sanitized = sanitizeDatabaseState(global.db.data)
    if (sanitized.changed) {
        console.log(
            '\x1b[33m[DB SANITIZE]\x1b[0m users removed=' + sanitized.usersRemoved +
            ' chats removed=' + sanitized.chatsRemoved +
            ' lidMap removed=' + sanitized.lidMapRemoved
        )
    }
    global._invalidateUserIndex = invalidateUserIndex
    global.db.chain = _.chain(global.db.data)
}

loadDatabase().then(() => {
    try {
        const { DatabaseService }     = require('./src/services/database')
        const { installGlobalBridge } = require('./src/adapters/globalBridge')
        const dbService = new DatabaseService(global.db)
        installGlobalBridge(dbService)
        originalConsoleLog('\x1b[32m[SERVICES]\x1b[0m DatabaseService aktif ✓')
    } catch (e) {
        originalConsoleLog('\x1b[33m[SERVICES]\x1b[0m Service layer skip:', e.message || '(no message)')
        if (e.stack) originalConsoleLog('\x1b[33m[SERVICES]\x1b[0m Stack:', String(e.stack).slice(0, 600))
    }
})

startPerfMonitor()

setTimeout(async () => {
    try {
        const s = global.db?.data?.settings
        if (s) {
            global.opts['self']     = s.public === false
            global.opts['restrict'] = s.restrict || false
            global.opts['autoread'] = s.autoread || false
            global.opts['welcome']  = s.welcome  || false
            global.opts['antiToxic'] = s.antiToxic || false
            console.log('\x1b[33m[MODE]\x1b[0m Bot berjalan di mode: ' + (global.opts['self'] ? 'SELF' : 'PUBLIC'))
        }
    } catch (_) {}
}, 3000)

const question = text => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => rl.question(text, ans => { rl.close(); resolve(ans) }))
}

const SESSION_DIR   = path.resolve(__dirname, 'session')
global.authFile     = 'session'

let globalState     = null
let globalSaveCreds = null

async function loadAuth() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true })
        if (DEBUG_SESSION) console.log('\x1b[33m[SESSION]\x1b[0m Folder baru dibuat: ' + SESSION_DIR)
    }
    const files = fs.readdirSync(SESSION_DIR)
    if (DEBUG_SESSION) {
        console.log('\x1b[33m[SESSION]\x1b[0m Membaca dari: ' + SESSION_DIR)
        console.log('\x1b[33m[SESSION]\x1b[0m File ditemukan: ' + files.length +
            (files.length ? ' (' + files.slice(0,5).join(', ') + (files.length > 5 ? '...' : '') + ')' : ' (kosong — akan pairing)'))
    }
    // useMultiFileAuthState dari shiraori-baileys (proxy ke Baileys resmi)
    const authResult    = await useMultiFileAuthState(SESSION_DIR)
    globalState         = authResult.state
    globalSaveCreds     = authResult.saveCreds
    authSaveDirty       = false
    if (DEBUG_SESSION) console.log('\x1b[32m[SESSION]\x1b[0m Auth state dimuat. registered=' + globalState.creds.registered)
    logSessionDiagnostics('after loadAuth')
}

let isRestarting   = false
let reconnectCount = 0

let cachedVersion = null

async function createSocket(version) {
    if (Array.isArray(version) && version.length) cachedVersion = version

    let browserConfig
    if (Browsers && typeof Browsers.macOS === 'function') {
        browserConfig = Browsers.macOS('Desktop')
    } else {
        browserConfig = ['Mac OS', 'Chrome', '121.0.0']
    }

    const connectionOptions = {
        ...(cachedVersion ? { version: cachedVersion } : {}),
        logger            : P({ level: 'silent' }),
        printQRInTerminal : true,
        mobile            : useMobile,
        browser           : browserConfig,
        markOnlineOnConnect: false,
        emitOwnEvents     : false,
        enableRecentMessageCache: true,
        retryRequestDelayMs: 250,
        maxMsgRetryCount  : 2,
        // ── KUNCI ANTI-LID: paksa WhatsApp kirim @s.whatsapp.net bukan @lid ──
        // Dengan mematikan LID, server WA akan selalu kirim participant dengan
        // format nomor asli (@s.whatsapp.net) bukan format opaque (@lid).
        // Ini adalah cara paling clean dan tidak bergantung pada resolusi manual.
        generateHighQualityLinkPreview: true,
        auth: {
            creds : globalState.creds,
            keys  : (() => {
                const _baseKeys = makeCacheableSignalKeyStore(globalState.keys, P({ level: 'silent' }), signalKeyStoreCache)
                return {
                    get: async (type, ids) => {
                        try { return await _baseKeys.get(type, ids) } catch (e) {
                            if (/bad mac/i.test(e?.message || '')) {
                                originalConsoleLog('\x1b[33m[KEYS]\x1b[0m Bad MAC pada get ' + type + ' — skip.')
                                return {}
                            }
                            throw e
                        }
                    },
                    set: async (data) => {
                        try { await _baseKeys.set(data) } catch (e) {
                            if (!/bad mac/i.test(e?.message || '')) throw e
                        }
                    },
                    isInTransaction: () => _baseKeys.isInTransaction?.() || false,
                    transaction    : _baseKeys.transaction?.bind(_baseKeys),
                    prefetch       : _baseKeys.prefetch?.bind(_baseKeys),
                }
            })()
        },
        msgRetryCounterCache,
        cachedGroupMetadata: async jid => {
            const cached = groupMetadataCache.get(jid)
            if (cached) return cached
            const live =
                global.conn?.chats?.[jid]?.metadata ||
                global.conn?.contacts?.[jid]?.metadata
            if (live) groupMetadataCache.set(jid, live)
            return live
        },
        shouldIgnoreJid: jid => isJidStatusBroadcast(jid) || isJidNewsletter(jid),
        getMessage: async key => {
            try { return global.conn?.loadMessage?.(key?.id) || undefined } catch (_) { return undefined }
        },
        patchMessageBeforeSending: (message) => message,
    }

    console.log('\x1b[33m[SOCKET]\x1b[0m Membuat koneksi WebSocket (shiraori-baileys)...')
    const conn = simple.makeWASocket(connectionOptions)
    conn.__socketToken = ++activeSocketToken
    conn.authState = globalState
    global.conn = conn
    console.log('\x1b[36m[SOCKET]\x1b[0m token=' + conn.__socketToken + ' pid=' + process.pid)

    // Pasang event creds.update segera setelah socket dibuat
    conn.ev.on('creds.update', () => {
        if (!isActiveSocket(conn)) return
        queueAuthStateSave('creds.update')
            .then(() => {
                if (DEBUG_SESSION) console.log('\x1b[32m[SESSION]\x1b[0m Creds tersimpan ke disk ✓')
            })
            .catch(e => {
                console.log('\x1b[31m[SESSION]\x1b[0m GAGAL simpan creds: ' + formatErrorBrief(e))
            })
    })

    // ── connection.update ─────────────────────────────────────────
    conn.ev.on('connection.update', async (update) => {
        if (!isActiveSocket(conn)) return
        const { connection, lastDisconnect, isNewLogin, qr } = update

        if (qr) {
            if (!useMobile && !globalState.creds.registered && pairingNumber) {
                console.log('\x1b[33m[PAIRING]\x1b[0m Koneksi siap — meminta pairing code untuk: +' + pairingNumber)
                setTimeout(async () => {
                    try {
                        let code = await conn.requestPairingCode(pairingNumber)
                        code = code?.match(/.{1,4}/g)?.join('-') || code
                        console.log('')
                        console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════╗')
                        console.log('\x1b[36m%s\x1b[0m', '║      PAIRING CODE BOT        ║')
                        console.log('\x1b[32m%s\x1b[0m', '║  >>  ' + code + '  <<        ║')
                        console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════╝')
                        console.log('')
                        console.log('\x1b[33m%s\x1b[0m', '📱 WA > ⋮ > Perangkat Tertaut > Tautkan dengan nomor telepon')
                    } catch (e) {
                        console.log('\x1b[31m[PAIRING]\x1b[0m Gagal meminta kode: ' + e.message)
                    }
                }, 3000)
            } else {
                console.log('\x1b[33m[INFO]\x1b[0m QR muncul — gunakan WhatsApp untuk scan QR.')
                qrcode.generate(qr, { small: true })
            }
        }

        global.stopped = connection

        if (isNewLogin) {
            console.log('\x1b[33m[INFO]\x1b[0m isNewLogin terdeteksi — database TIDAK direset')
        }

        if (connection === 'close') {
            let reason = 0
            let errMsg = 'unknown'
            try {
                const boom = new Boom(lastDisconnect?.error)
                reason = boom?.output?.statusCode || 0
                errMsg = boom?.message || lastDisconnect?.error?.message || 'unknown'
            } catch (_) {}

            console.log('\x1b[33m[KONEKSI]\x1b[0m Terputus | reason=' + reason + ' | ' + errMsg)

            const isBadMac = isBadMacError(errMsg)
            if (isBadMac) {
                logSessionDiagnostics('before bad-mac recovery')
                if (badMacRecoveryInFlight) {
                    console.log('\x1b[33m[SESSION]\x1b[0m Recovery Bad MAC sedang berjalan. Skip event duplikat.')
                    return
                }
                const now = Date.now()
                if (now - lastBadMacCleanup < BAD_MAC_COOLDOWN_MS) {
                    const waitSec = Math.ceil((BAD_MAC_COOLDOWN_MS - (now - lastBadMacCleanup)) / 1000)
                    console.log('\x1b[33m[SESSION]\x1b[0m Bad MAC muncul lagi. Skip cleanup berulang, tunggu ' + waitSec + 's.')
                    reconnectBot()
                    return
                }
                badMacRecoveryInFlight = true
                lastBadMacCleanup = now
                console.log('\x1b[33m[SESSION]\x1b[0m Bad MAC terdeteksi — membersihkan file korup...')
                try {
                    await flushAuthStateNow().catch(() => {})
                    const deleted = cleanupCorruptedSessionFiles()
                    resetSocketCaches({ keepRetryCounter: false })
                    console.log('\x1b[32m[SESSION]\x1b[0m ' + deleted + ' file korup dihapus.')
                    logSessionDiagnostics('after cleanup bad-mac')
                    await destroySocket(conn)
                    await loadAuth()
                    await createSocket()
                    console.log('\x1b[32m[SESSION]\x1b[0m Socket baru dibuat dengan keys bersih ✓')
                } catch (e) {
                    console.log('\x1b[31m[SESSION]\x1b[0m Gagal recovery Bad MAC: ' + formatErrorBrief(e))
                    reconnectBot()
                } finally {
                    badMacRecoveryInFlight = false
                }
                return
            }

            const shouldDeleteSession =
                reason === DisconnectReason.loggedOut ||
                reason === DisconnectReason.multideviceMismatch

            if (shouldDeleteSession) {
                console.log('\x1b[31m[SESSION]\x1b[0m Session tidak valid (reason=' + reason + ')')
                console.log('\x1b[31m[SESSION]\x1b[0m Menghapus session folder: ' + SESSION_DIR)
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }) } catch (_) {}
                console.log('\x1b[31m[SESSION]\x1b[0m Restart bot untuk pairing ulang.')
                process.exit(1)

            } else if (reason === DisconnectReason.badSession) {
                if (shouldTreatBadSessionAsTransient(reason, errMsg)) {
                    console.log('\x1b[33m[SESSION]\x1b[0m reason=500 / bad session terdeteksi, tapi dianggap sementara.')
                    reconnectBot('bad-session transient')
                } else {
                    console.log('\x1b[33m[SESSION]\x1b[0m Bad session berulang. Bersihkan file session korup dulu.')
                    try {
                        await flushAuthStateNow().catch(() => {})
                        const deleted = cleanupCorruptedSessionFiles()
                        resetSocketCaches({ keepRetryCounter: false })
                        console.log('\x1b[32m[SESSION]\x1b[0m ' + deleted + ' file korup dihapus.')
                        logSessionDiagnostics('after cleanup bad-session')
                    } catch (e) {
                        console.log('\x1b[31m[SESSION]\x1b[0m Gagal cleanup bad-session: ' + formatErrorBrief(e))
                    }
                    reconnectBot('bad-session recovery')
                }

            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('\x1b[31m[SESSION]\x1b[0m Sesi digantikan perangkat lain! Restart manual.')
                process.exit(1)

            } else {
                reconnectBot()
            }
        }

        if (connection === 'open') {
            reconnectCount = 0
            badSessionStreak = 0
            lastOpenAt = Date.now()
            groupMetadataCache.flushAll()
            const botId = global.conn?.user?.id || 'unknown'
            console.log('\x1b[32m[KONEKSI]\x1b[0m ✅ Terhubung! Bot: ' + botId)
            console.log('\x1b[32m[KONEKSI]\x1b[0m ✅ Bot siap menerima pesan!')
            console.log('\x1b[36m[FASTMODE]\x1b[0m FastMode aktif (shiraori-baileys) ✓')
            // Real-time console → grup WA
            installConsoleForwarder('6283151212966-1584346611@g.us', true)

            if (global.reloadHandler) {
                try { global.reloadHandler() }
                catch (e) { console.log('\x1b[31m[HANDLER]\x1b[0m reloadHandler error: ' + e.message) }
            }

            if (typeof global.startOnBotOnce === 'function') {
                setTimeout(() => {
                    global.startOnBotOnce(global.conn).catch(e =>
                        console.log('\x1b[31m[ONBOT]\x1b[0m start error: ' + e.message)
                    )
                }, 1500)
            }

            // Sync LID mapping
            setTimeout(async () => {
                try {
                    if (!isActiveSocket(conn)) return
                    await maybeSyncLidMap(conn)
                } catch (_) {}
            }, 5000)
        }

        if (global.db.data == null) await loadDatabase()
    })

    return conn
}

async function reconnectBot(source = 'unknown') {
    reconnectRequested = true
    if (isRestarting) {
        console.log('\x1b[33m[RECONNECT]\x1b[0m Permintaan reconnect dari ' + source + ' diantrikan.')
        return
    }
    if (badMacRecoveryInFlight) {
        console.log('\x1b[33m[RECONNECT]\x1b[0m Menunggu recovery Bad MAC selesai...')
        return
    }
    isRestarting = true
    reconnectRequested = false
    reconnectCount++

    const delay = Math.min(5000 + (reconnectCount - 1) * 3000, 30000)
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    console.log('\x1b[33m[RECONNECT]\x1b[0m Reconnect ke-' + reconnectCount + ' dari ' + source + ' dalam ' + (delay / 1000) + 's...')

    await new Promise(resolve => {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; resolve() }, delay)
    })
    isRestarting = false

    try {
        const oldConn = global.conn
        await destroySocket(oldConn)
        await createSocket()
        console.log('\x1b[32m[RECONNECT]\x1b[0m Socket baru berhasil dibuat ✓')
        global._lastRecoveryAt = Date.now()
        global._recoveryNotifiedChats = new Set()
    } catch (e) {
        console.log('\x1b[31m[RECONNECT]\x1b[0m Gagal: ' + formatErrorBrief(e) + ' — coba lagi...')
        reconnectBot('retry-after-failure')
        return
    }

    if (reconnectRequested) {
        console.log('\x1b[33m[RECONNECT]\x1b[0m Ada permintaan reconnect tambahan. Jadwalkan ulang sekali lagi.')
        reconnectBot('queued-request')
    }
}

// ── Plugin loader & reload handler ─────────────────────────────────
function buildPluginRegistry() {
    const entries = []
    const allEntries = []
    const beforeEntries = []
    const exactCommandMap = new Map()

    for (const [name, plugin] of Object.entries(global.plugins || {})) {
        if (!plugin) continue
        const entry = {
            name, plugin,
            hasAll: typeof plugin.all === 'function',
            hasBefore: typeof plugin.before === 'function',
            isCallable: typeof plugin === 'function',
            hasCustomPrefix: plugin.customPrefix != null,
            exactCommands: null,
        }
        const commandDef = plugin.command
        if (typeof commandDef === 'string') {
            entry.exactCommands = new Set([commandDef.toLowerCase()])
        } else if (Array.isArray(commandDef) && commandDef.length && commandDef.every(cmd => typeof cmd === 'string')) {
            entry.exactCommands = new Set(commandDef.map(cmd => cmd.toLowerCase()))
        }
        entries.push(entry)
        if (entry.hasAll) allEntries.push(entry)
        if (entry.hasBefore) beforeEntries.push(entry)
        if (entry.isCallable && entry.exactCommands && !entry.hasCustomPrefix) {
            for (const command of entry.exactCommands) {
                if (!exactCommandMap.has(command)) exactCommandMap.set(command, [])
                exactCommandMap.get(command).push(entry)
            }
        }
    }

    global.pluginRegistry = {
        entries,
        allEntries,
        beforeEntries,
        exactCommandMap,
        nonExactCommandEntries: entries.filter(entry => entry.isCallable && !entry.exactCommands),
    }
}

function initPluginsAndHandler() {
    const pluginFolder  = path.join(__dirname, 'plugins')
    const pluginFilter  = f => /\.js$/.test(f)
    const pluginReloadTimers = new Map()
    const enablePluginWatcher = process.env.DISABLE_PLUGIN_WATCH !== 'true' &&
        !opts['nopreload'] &&
        process.env.NODE_ENV !== 'production'
    global.plugins = {}

    for (let filename of fs.readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            global.plugins[filename] = require(path.join(pluginFolder, filename))
        } catch (e) {
            console.log('\x1b[33m[PLUGIN]\x1b[0m Error [' + filename + ']: ' + e.message)
        }
    }
    buildPluginRegistry()
    console.log('\x1b[32m[PLUGIN]\x1b[0m ' + Object.keys(global.plugins).length + ' plugin dimuat')

    global.reload = (_ev, filename) => {
        if (!pluginFilter(filename)) return
        if (pluginReloadTimers.has(filename)) clearTimeout(pluginReloadTimers.get(filename))
        pluginReloadTimers.set(filename, setTimeout(() => {
            pluginReloadTimers.delete(filename)
            let dir = path.join(pluginFolder, filename)
            if (dir in require.cache) delete require.cache[dir]
            if (!fs.existsSync(dir)) {
                console.log('[PLUGIN] Dihapus: ' + filename)
                delete global.plugins[filename]
                buildPluginRegistry()
                return
            }
            let source
            try {
                source = fs.readFileSync(dir)
            } catch (e) {
                if (e && ['EBUSY', 'EPERM'].includes(e.code)) {
                    console.log('[PLUGIN] Busy, tunda reload: ' + filename)
                    pluginReloadTimers.set(filename, setTimeout(() => global.reload(null, filename), 1000))
                    return
                }
                console.error('[PLUGIN] Read error ' + filename + ': ' + e.message)
                return
            }
            let err = syntaxerror(source, filename)
            if (err) {
                console.error('[PLUGIN] Syntax error ' + filename + ': ' + err)
            } else {
                try {
                    global.plugins[filename] = require(dir)
                    buildPluginRegistry()
                    console.log('[PLUGIN] Diperbarui: ' + filename)
                } catch (e) {
                    console.error('[PLUGIN] Load error ' + filename + ': ' + e.message)
                }
            }
        }, 300))
    }
    Object.freeze(global.reload)
    if (enablePluginWatcher) {
        fs.watch(pluginFolder, global.reload)
    } else {
        console.log('\x1b[33m[PLUGIN]\x1b[0m Hot reload dimatikan untuk mode produksi/panel')
    }

    global.reloadHandler = function (restatConn) {
        let handler
        try {
            const handlerPath = require.resolve('./handler')
            if (handlerPath in require.cache) delete require.cache[handlerPath]
            handler = require(handlerPath)
        } catch (e) {
            console.log('\x1b[31m[HANDLER]\x1b[0m Gagal load handler: ' + e.message)
            return false
        }

        const conn = global.conn
        if (!conn) return false

        if (restatConn) {
            console.log('\x1b[33m[HANDLER]\x1b[0m restatConn=true → reconnectBot()')
            reconnectBot()
            return true
        }

        // Lepas listener lama sebelum pasang baru (cegah duplicate listener)
        try { conn.ev.off('messages.upsert',          conn.handler)           } catch (_) {}
        try { conn.ev.off('group-participants.update', conn.participantsUpdate) } catch (_) {}
        try { conn.ev.off('message.delete',           conn.onDelete)           } catch (_) {}
        try { conn.ev.off('contacts.upsert',          conn.lidMapper)          } catch (_) {}
        try { conn.ev.off('contacts.update',          conn.lidMapper)          } catch (_) {}

        conn.welcome  = 'Hai, @user!\nSelamat datang di @subject\n\n@desc'
        conn.bye      = 'Selamat tinggal @user!'
        conn.spromote = '@user sekarang admin!'
        conn.sdemote  = '@user bukan admin lagi!'

        const boundHandler = handler.handler.bind(conn)
        conn.handler = async function (chatUpdate) {
            try { return await boundHandler(chatUpdate) } catch (e) {
                console.log('\x1b[31m[HANDLER]\x1b[0m Uncaught handler error: ' + (e?.message || e))
                if (e?.stack) console.log(String(e.stack).slice(0, 800))
            }
        }
        conn.participantsUpdate = handler.participantsUpdate.bind(conn)
        conn.onDelete           = handler.delete.bind(conn)

        // ── LID Mapper — pakai extractPhoneNumber dari shiraori-baileys ──────
        // Simpan mapping LID → nomor WA dari contacts update
        conn.lidMapper = function(contacts) {
            if (!Array.isArray(contacts)) contacts = [contacts]
            if (!global.db?.data?.settings) return
            if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
            let mapped = 0
            for (const c of contacts) {
                if (c?.lid && c?.id && c.id.endsWith('@s.whatsapp.net')) {
                    const lid = c.lid.endsWith('@lid') ? c.lid : c.lid + '@lid'
                    // Gunakan extractPhoneNumber dari shiraori-baileys (lebih robust)
                    const num = extractPhoneNumber(c.id)
                    if (num && /^\d{8,15}$/.test(num)) {
                        global.db.data.settings.lidMap[lid] = num
                        mapped++
                    }
                }
            }
            if (mapped > 0) {
                console.log('\x1b[32m[LID MAPPER]\x1b[0m ' + mapped + ' mapping baru tersimpan')
                global.db.write().catch(() => {})
            }
        }

        conn.ev.on('messages.upsert',          conn.handler)
        conn.ev.on('group-participants.update', conn.participantsUpdate)
        conn.ev.on('message.delete',           conn.onDelete)
        conn.ev.on('contacts.upsert',          conn.lidMapper)
        conn.ev.on('contacts.update',          conn.lidMapper)

        console.log('\x1b[32m[HANDLER]\x1b[0m Handler terpasang ✓')
        return true
    }
}

// DB Auto-save
if (!opts['test']) {
    global.scheduler.registerInterval('db-autosave', 120000, async () => {
        if (global.db.data) {
            await global.db.writeNow().catch(e =>
                console.log('\x1b[31m[DB]\x1b[0m Write error: ' + e.message)
            )
        }
    })
}

// Global error handlers
process.removeAllListeners('uncaughtException')
process.removeAllListeners('unhandledRejection')

const ignoredErrors = [
    'Cannot destructure property', 'remoteJid', 'Closing open session',
    'Closing session', 'Connection Failure', 'connection closing',
    'ECONNRESET', 'ETIMEDOUT', 'Socket connection timeout',
    'read ECONNRESET', 'write ECONNRESET', 'connect ECONNREFUSED',
    'Connection closed', 'Stream Errored', 'connection-replace',
    'rate-overlimit', 'Request Entity Too Large',
    'Bad MAC', 'bad mac', 'Failed to decrypt message',
    'Session error', 'decryptWithSessions', 'decryptWhisperMessage',
]
const isIgnored = msg => ignoredErrors.some(e => String(msg).includes(e))

process.on('uncaughtException', err => {
    const msg = err?.message || String(err)
    if (!isIgnored(msg)) {
        console.log('\x1b[31m[FATAL]\x1b[0m uncaughtException: ' + msg)
        console.log((err?.stack && String(err.stack).slice(0, 500)) || '')
    }
})

process.on('unhandledRejection', reason => {
    const msg = String(reason?.message || reason || '')
    if (!isIgnored(msg)) {
        console.log('\x1b[33m[WARN]\x1b[0m unhandledRejection: ' + msg.slice(0, 200))
    }
})

for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
    process.on(sig, () => {
        releaseInstanceLock()
        flushAuthStateNow().catch(() => {})
        global.db.writeNow?.().catch(() => {})
    })
}

process.on('exit', () => { releaseInstanceLock() })

// ═══════════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════
;(async () => {
    try {
        console.clear()
        console.log('\x1b[36m%s\x1b[0m', '╬' + '═'.repeat(40) + '╬')
        console.log('\x1b[36m%s\x1b[0m', '     ShiraoriBOT-V3 (shiraori-baileys)   ')
        console.log('\x1b[36m%s\x1b[0m', '╩' + '═'.repeat(40) + '╩')
        console.log('')

        acquireInstanceLock()
        console.log('\x1b[32m[LOCK]\x1b[0m Session lock aktif untuk PID ' + process.pid)
        logSessionDiagnostics('startup')

        // STEP 0: Bersihkan file session korup saat startup
        if (fs.existsSync(SESSION_DIR)) {
            const startupCleaned = cleanupCorruptedSessionFiles()
            if (startupCleaned > 0) {
                console.log('\x1b[33m[SESSION]\x1b[0m Startup cleanup: ' + startupCleaned + ' file sesi lama dihapus (Bad MAC prevention)')
            }
        }

        // STEP 1: Muat auth state
        console.log('\x1b[33m[1/4]\x1b[0m Memuat session...')
        await loadAuth()
        console.log('\x1b[32m[1/4]\x1b[0m Session OK ✓')

        // STEP 2: Fetch WA version
        console.log('\x1b[33m[2/4]\x1b[0m Menyiapkan versi WhatsApp...')
        let version = null
        if (SHOULD_FETCH_LATEST_VERSION) {
            try {
                const res = await Promise.race([
                    fetchLatestBaileysVersion(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
                ])
                version = res.version
                console.log('\x1b[32m[2/4]\x1b[0m WA version: ' + version.join('.') + ' ✓')
            } catch (e) {
                console.log('\x1b[33m[2/4]\x1b[0m Gagal fetch versi terbaru, pakai versi bawaan library.')
            }
        } else {
            console.log('\x1b[32m[2/4]\x1b[0m Pakai versi bawaan Baileys.')
        }

        // STEP 3: Inisialisasi plugin & handler
        console.log('\x1b[33m[3/4]\x1b[0m Memuat plugin...')
        initPluginsAndHandler()

        // STEP 4: Buat socket pertama
        console.log('\x1b[33m[4/4]\x1b[0m Membuat koneksi WhatsApp...')
        await createSocket(version)

        if (globalState.creds.registered) {
            global.reloadHandler()
        }

        console.log('')
        console.log('\x1b[36m%s\x1b[0m', '═'.repeat(42))
        console.log('\x1b[32m%s\x1b[0m', '  Bot berhasil diinisialisasi!')
        console.log('\x1b[32m%s\x1b[0m', '  Library: shiraori-baileys v1.1.4')
        console.log('\x1b[32m%s\x1b[0m', '  FastMode: AKTIF ✓')
        console.log('\x1b[36m%s\x1b[0m', '═'.repeat(42))
        console.log('')

    } catch (err) {
        console.log('\x1b[31m[FATAL]\x1b[0m ' + formatErrorBrief(err))
        if (err?.stack) console.log(String(err.stack).slice(0, 500))
        process.exit(1)
    }
})()

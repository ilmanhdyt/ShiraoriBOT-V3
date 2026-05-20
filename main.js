require('./config')


const baileysPro = require('@whiskeysockets/baileys')
const makeWASocket              = baileysPro.default || baileysPro.makeWASocket || baileysPro
const useMultiFileAuthState     = baileysPro.useMultiFileAuthState
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
const syntaxerror = require('syntax-error')
const P           = require('pino')
const { Boom }    = require('@hapi/boom')
const { monitorEventLoopDelay, performance } = require('perf_hooks')
const readline    = require('readline')
const { sanitizeDatabaseState, isAllowedPhoneNumber } = require('./lib/jidUtils')

const useMobile     = process.argv.includes('--mobile')
const pairingNumber = process.env.PAIRING_NUMBER || ''
const DEBUG_SESSION = process.env.DEBUG_SESSION === 'true'
const QUIET_LIBSIGNAL_SESSION_LOGS = process.env.QUIET_LIBSIGNAL_SESSION_LOGS !== 'false'
const ENABLE_PERF_MONITOR = process.env.ENABLE_PERF_MONITOR !== 'false'

let simple = require('./lib/simple')

function fixBrokenEmojiText(text) {
    return String(text || '')
        .replaceAll('âœ“', '\u2713')
        .replaceAll('âœ…', '\u2705')
        .replaceAll('âŒ', '\u274C')
        .replaceAll('âš ï¸', '\u26A0\uFE0F')
        .replaceAll('â³', '\u23F3')
        .replaceAll('â€”', '\u2014')
        .replaceAll('â†’', '\u2192')
        .replaceAll('â•¬', '+')
        .replaceAll('â•©', '+')
        .replaceAll('â•', '=')
}

function importLegacyUsersIntoDb(dbData) {
    try {
        const legacyUsersDir = path.join(__dirname, 'database', 'users')
        if (!fs.existsSync(legacyUsersDir)) return { migrated: 0, failed: 0 }

        if (!dbData.users || typeof dbData.users !== 'object') dbData.users = {}

        let migrated = 0
        let failed = 0

        for (const file of fs.readdirSync(legacyUsersDir)) {
            if (!file.endsWith('.json')) continue

            const num = file.slice(0, -5)
            if (!isAllowedPhoneNumber(num)) continue

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

const originalConsoleInfo = console.info.bind(console)
const originalConsoleWarn = console.warn.bind(console)
const originalConsoleLog = console.log.bind(console)
const originalConsoleError = console.error.bind(console)

function shouldSuppressLibsignalSessionLog(args = []) {
    if (!QUIET_LIBSIGNAL_SESSION_LOGS || DEBUG_SESSION) return false
    const msgs = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg && typeof arg.message === 'string') return arg.message
        if (arg && typeof arg.toString === 'function') return String(arg.toString())
        return ''
    }).join(' ')

    return msgs === 'Closing stale open session for new outgoing prekey bundle' ||
        msgs.startsWith('Closing session:') ||
        msgs.startsWith('Closing open session in favor of incoming prekey bundle') ||
        msgs.startsWith('Failed to decrypt message with any known session') ||
        msgs.startsWith('Session error: Error: Bad MAC') ||
        msgs.includes('Failed to decrypt message') ||
        msgs.includes('Bad MAC Error: Bad MAC')
}

function normalizeConsoleArgs(args = []) {
    return args.map(arg => typeof arg === 'string' ? fixBrokenEmojiText(arg) : arg)
}

console.log = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    originalConsoleLog(...normalizeConsoleArgs(args))
}

console.info = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    originalConsoleInfo(...normalizeConsoleArgs(args))
}

console.warn = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    originalConsoleWarn(...normalizeConsoleArgs(args))
}

console.error = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    originalConsoleError(...normalizeConsoleArgs(args))
}

console.debug = (...args) => {
    if (shouldSuppressLibsignalSessionLog(args)) return
    if (typeof originalConsoleLog === 'function') {
        originalConsoleLog(...normalizeConsoleArgs(args))
    } else {
        originalConsoleInfo(...normalizeConsoleArgs(args))
    }
}

const { Low, JSONFile } = require('./lib/lowdb')
const mongoDB = require('./lib/mongoDB')
const HybridDBAdapter = require('./lib/hybridDBAdapter')

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
const localDbRoot = path.join('database', localDbPrefix ? localDbPrefix + 'database' : 'database')
const localLegacyDbFile = path.join('database', localDbPrefix + 'database.json')

global.db = new Low(
    /https?:\/\//.test(opts['db'] || '')
        ? new cloudDBAdapter(opts['db'])
        : /mongodb/.test(opts['db'])
            ? new mongoDB(opts['db'])
            : new HybridDBAdapter(localDbRoot, { legacyFile: localLegacyDbFile })
)
global.DATABASE = global.db

// Kurangi spam penulisan database ke disk.
// Banyak plugin memanggil global.db.write() berkali-kali dalam waktu dekat.
const DB_WRITE_DEBOUNCE_MS = Math.max(1000, Number(process.env.DB_WRITE_DEBOUNCE_MS || 2000))
const AUTH_SAVE_DEBOUNCE_MS = Math.max(250, Number(process.env.AUTH_SAVE_DEBOUNCE_MS || 1500))
const BAD_MAC_COOLDOWN_MS = Math.max(60 * 1000, Number(process.env.BAD_MAC_COOLDOWN_MS || 10 * 60 * 1000))
const SHOULD_FETCH_LATEST_VERSION = process.env.BAILEYS_FETCH_LATEST_VERSION === 'true'
const INSTANCE_LOCK_FILE = path.resolve(__dirname, '.bot-session.lock')
const rawDbWrite = global.db.write.bind(global.db)
let dbDirty = false
let dbWriteTimer = null
let dbWriteInFlight = false
let dbWriteDeferred = null
let authSaveDirty = false
let authSaveTimer = null
let authSaveInFlight = false
let authSaveDeferred = null
let lastBadMacCleanup = 0
let activeSocketToken = 0
let badMacRecoveryInFlight = false
let instanceLockFd = null
let reconnectTimer = null
let reconnectRequested = false
let lastOpenAt = 0
let lastBadSessionAt = 0
let badSessionStreak = 0
let lidSyncInFlight = false
let lastLidSyncAt = 0
const msgRetryCounterCache = new NodeCache({ stdTTL: 60 * 60, useClones: false })
const signalKeyStoreCache = new NodeCache({ stdTTL: 10 * 60, useClones: false })
const groupMetadataCache = new NodeCache({ stdTTL: 5 * 60, useClones: false })

const BAD_SESSION_STREAK_WINDOW_MS = 2 * 60 * 1000
const BAD_SESSION_RECENT_OPEN_MS = 10 * 60 * 1000
const LID_SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000

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
            if (stat.isDirectory()) {
                walk(full)
                continue
            }
            if (
                f.startsWith('sender-key') ||
                f.startsWith('session-') ||
                f.startsWith('app-state')
            ) {
                fs.rmSync(full, { force: true })
                deleted++
            }
        }
    }
    walk(SESSION_DIR)
    return deleted
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
        console.log('\x1b[33m[LID SYNC]\x1b[0m Dilewati karena baru sync. Coba lagi sekitar ' + waitMin + ' menit.')
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
    try {
        await flushAuthStateNow()
    } catch (e) {
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
    const summary = {
        exists: true,
        total: 0,
        senderKeys: 0,
        sessions: 0,
        appState: 0,
        preKeys: 0,
        creds: false,
        recent: [],
    }
    const recentFiles = []
    const walk = (dir) => {
        const files = fs.readdirSync(dir)
        for (const name of files) {
            const full = path.join(dir, name)
            const stat = fs.statSync(full)
            if (stat.isDirectory()) {
                walk(full)
                continue
            }
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
            ' | exists=' + d.exists +
            ' total=' + d.total +
            ' creds=' + d.creds +
            ' preKeys=' + d.preKeys +
            ' sessions=' + d.sessions +
            ' senderKeys=' + d.senderKeys +
            ' appState=' + d.appState +
            (d.recent.length ? ' recent=' + d.recent.join(',') : '')
        )
    } catch (e) {
        console.log('\x1b[31m[SESSION-DIAG]\x1b[0m Gagal baca diagnostik: ' + formatErrorBrief(e))
    }
}

function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false
    try {
        process.kill(pid, 0)
        return true
    } catch (_) {
        return false
    }
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
            throw new Error('Bot instance lain masih aktif dengan PID ' + existingPid + '. Hentikan instance lama dulu agar session tidak bentrok.')
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
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

async function flushDatabaseNow() {
    if (!dbWriteDeferred) dbWriteDeferred = createDeferred()
    if (dbWriteTimer) {
        clearTimeout(dbWriteTimer)
        dbWriteTimer = null
    }
    if (dbWriteInFlight) return dbWriteDeferred.promise

    const currentDeferred = dbWriteDeferred
    if (!global.db.data || !dbDirty) {
        currentDeferred.resolve()
        if (dbWriteDeferred === currentDeferred) dbWriteDeferred = null
        return currentDeferred.promise
    }

    dbWriteInFlight = true
    try {
        do {
            dbDirty = false
            await rawDbWrite()
        } while (dbDirty)
        currentDeferred.resolve()
    } catch (e) {
        dbDirty = true
        currentDeferred.reject(e)
        throw e
    } finally {
        dbWriteInFlight = false
        if (dbWriteDeferred === currentDeferred) dbWriteDeferred = null
        if (dbDirty && !dbWriteTimer) {
            global.db.write().catch(() => {})
        }
    }

    return currentDeferred.promise
}

async function flushAuthStateNow() {
    if (!globalSaveCreds) return
    if (!authSaveDeferred) authSaveDeferred = createDeferred()
    if (authSaveTimer) {
        clearTimeout(authSaveTimer)
        authSaveTimer = null
    }
    if (authSaveInFlight) return authSaveDeferred.promise

    const currentDeferred = authSaveDeferred
    if (!authSaveDirty) {
        currentDeferred.resolve()
        if (authSaveDeferred === currentDeferred) authSaveDeferred = null
        return currentDeferred.promise
    }

    authSaveInFlight = true
    try {
        do {
            authSaveDirty = false
            await globalSaveCreds()
        } while (authSaveDirty)
        currentDeferred.resolve()
    } catch (e) {
        authSaveDirty = true
        currentDeferred.reject(e)
        throw e
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
    return dbWriteDeferred.promise
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

            const maxLagMs = Number(histogram.max / 1e6).toFixed(0)
            const meanLagMs = Number(histogram.mean / 1e6).toFixed(0)
            const p95LagMs = Number(histogram.percentile(95) / 1e6).toFixed(0)
            const memMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
            const activeHandles = typeof process._getActiveHandles === 'function'
                ? process._getActiveHandles().length
                : 0

            if (Number(maxLagMs) >= 250 || elu.utilization >= 0.8) {
                console.log(
                    '\x1b[33m[PERF]\x1b[0m ' +
                    `ELU=${(elu.utilization * 100).toFixed(0)}% ` +
                    `lagP95=${p95LagMs}ms lagMax=${maxLagMs}ms ` +
                    `rss=${memMb}MB handles=${activeHandles}`
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
        users: {},
        chats: {},
        stats: {},
        msgs: {},
        sticker: {},
        settings: {},
        ...(global.db.data || {}),
    }
    const legacyImport = importLegacyUsersIntoDb(global.db.data)
    if (legacyImport.migrated || legacyImport.failed) {
        console.log(
            '\x1b[36m[DB IMPORT]\x1b[0m legacy users imported=' + legacyImport.migrated +
            ' failed=' + legacyImport.failed
        )
    }
    const sanitized = sanitizeDatabaseState(global.db.data)
    if (sanitized.changed) {
        console.log(
            '\x1b[33m[DB SANITIZE]\x1b[0m users removed=' + sanitized.usersRemoved +
            ' chats removed=' + sanitized.chatsRemoved +
            ' lidMap removed=' + sanitized.lidMapRemoved
        )
    }
    global.db.chain = _.chain(global.db.data)
}
loadDatabase()
startPerfMonitor()

setTimeout(async () => {
    try {
        const s = global.db?.data?.settings
        if (s) {
            global.opts['self']     = s.public === false
            global.opts['restrict'] = s.restrict || false
            global.opts['autoread'] = s.autoread || false
            console.log('\x1b[33m[MODE]\x1b[0m Bot berjalan di mode: ' + (global.opts['self'] ? 'SELF' : 'PUBLIC'))
        }
    } catch (_) {}
}, 3000)

const question = text => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => rl.question(text, ans => { rl.close(); resolve(ans) }))
}

// ═══════════════════════════════════════════════════════════════════
// SESSION CONFIG — satu path konsisten, tidak berubah saat reconnect
// ═══════════════════════════════════════════════════════════════════
const SESSION_DIR = path.resolve(__dirname, 'session')
global.authFile   = 'session'  // backward compat

// ═══════════════════════════════════════════════════════════════════
// AUTH STATE — dimuat SEKALI, tidak pernah dibuat ulang saat reconnect
// ═══════════════════════════════════════════════════════════════════
let globalState     = null
let globalSaveCreds = null

async function loadAuth() {
    if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true })
        if (DEBUG_SESSION) {
            console.log('\x1b[33m[SESSION]\x1b[0m Folder baru dibuat: ' + SESSION_DIR)
        }
    }
    const files = fs.readdirSync(SESSION_DIR)
    if (DEBUG_SESSION) {
        console.log('\x1b[33m[SESSION]\x1b[0m Membaca dari: ' + SESSION_DIR)
        console.log('\x1b[33m[SESSION]\x1b[0m File ditemukan: ' + files.length +
            (files.length ? ' (' + files.slice(0,5).join(', ') + (files.length > 5 ? '...' : '') + ')' : ' (kosong — akan pairing)'))
    }

    const authResult    = await useMultiFileAuthState(SESSION_DIR)
    globalState         = authResult.state
    globalSaveCreds     = authResult.saveCreds
    authSaveDirty       = false

    if (DEBUG_SESSION) {
        console.log('\x1b[32m[SESSION]\x1b[0m Auth state dimuat. registered=' + globalState.creds.registered)
    }
    logSessionDiagnostics('after loadAuth')
}

// ═══════════════════════════════════════════════════════════════════
// RECONNECT STATE
// ═══════════════════════════════════════════════════════════════════
let isRestarting   = false
let reconnectCount = 0

// ═══════════════════════════════════════════════════════════════════
// createSocket — buat socket baru, pakai globalState yang SAMA
// Dipanggil pertama kali + setiap reconnect
// ═══════════════════════════════════════════════════════════════════
let cachedVersion = null

async function createSocket(version) {
    if (Array.isArray(version) && version.length) cachedVersion = version

    let browserConfig
    if (Browsers && typeof Browsers.ubuntu === 'function') {
        browserConfig = Browsers.ubuntu('Chrome')
    } else {
        browserConfig = ['Ubuntu', 'Chrome', '120.0.0']
    }

    const connectionOptions = {
        ...(cachedVersion ? { version: cachedVersion } : {}),
        logger            : P({ level: 'silent' }),
        printQRInTerminal : false,
        mobile            : useMobile,
        browser           : browserConfig,
        markOnlineOnConnect: false,
        emitOwnEvents: false,
        enableRecentMessageCache: true,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 2,
        auth: {
            creds : globalState.creds,
            keys  : makeCacheableSignalKeyStore(globalState.keys, P({ level: 'silent' }), signalKeyStoreCache)
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
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
            try {
                return global.conn?.loadMessage?.(key?.id) || undefined
            } catch (_) {
                return undefined
            }
        },
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage || message.templateMessage ||
                message.listMessage    || message.interactiveMessage
            )
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                            ...message,
                        },
                    },
                }
            }
            return message
        },
    }

    console.log('\x1b[33m[SOCKET]\x1b[0m Membuat koneksi WebSocket...')
    const conn = simple.makeWASocket(connectionOptions)
    conn.__socketToken = ++activeSocketToken
    conn.authState = globalState
    global.conn = conn
    console.log('\x1b[36m[SOCKET]\x1b[0m token=' + conn.__socketToken + ' pid=' + process.pid)

    // ── PENTING: creds.update harus didaftarkan SEGERA setelah socket dibuat
    // Ini memastikan session tersimpan saat pairing berhasil
    conn.ev.on('creds.update', () => {
        if (!isActiveSocket(conn)) return
        queueAuthStateSave('creds.update')
            .then(() => {
            if (DEBUG_SESSION) {
                console.log('\x1b[32m[SESSION]\x1b[0m Creds tersimpan ke disk ✓')
            }
            })
            .catch(e => {
                console.log('\x1b[31m[SESSION]\x1b[0m GAGAL simpan creds: ' + formatErrorBrief(e))
            })
    })

    // ── connection.update ────────────────────────────────────────────
    conn.ev.on('connection.update', async (update) => {
        if (!isActiveSocket(conn)) return
        const { connection, lastDisconnect, isNewLogin, qr } = update

        if (qr) {
            console.log('\x1b[33m[INFO]\x1b[0m QR muncul — gunakan pairing code, abaikan QR')
        }

        global.stopped = connection

        // FIX: isNewLogin TIDAK boleh menghapus database
        // Data user yang sudah ada harus tetap ada
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

            // FIXED: Bad MAC → jangan hapus semua session
            // Hapus HANYA sender-key + session-* + app-state (yang korup), pertahankan pre-key + creds
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
                    console.log('\x1b[32m[SESSION]\x1b[0m Socket baru dibuat dengan keys bersih \u2713')
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
                    console.log('\x1b[33m[SESSION]\x1b[0m Session tidak dihapus. Mencoba reconnect bertahap...')
                    reconnectBot('bad-session transient')
                } else {
                    console.log('\x1b[33m[SESSION]\x1b[0m Bad session berulang tanpa koneksi stabil. Bersihkan file session korup dulu.')
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

            // Panggil reloadHandler agar message handler terpasang
            if (global.reloadHandler) {
                try { global.reloadHandler() }
                catch (e) { console.log('\x1b[31m[HANDLER]\x1b[0m reloadHandler error: ' + e.message) }
            }

            // Trigger plugin onbot langsung saat koneksi benar-benar terbuka,
            // jadi tidak perlu menunggu pesan masuk dulu.
            if (typeof global.startOnBotOnce === 'function') {
                setTimeout(() => {
                    global.startOnBotOnce(global.conn).catch(e =>
                        console.log('\x1b[31m[ONBOT]\x1b[0m start error: ' + e.message)
                    )
                }, 1500)
            }

            // Sync LID mapping dari semua grup
            setTimeout(async () => {
                try {
                    if (!isActiveSocket(conn)) return
                    await maybeSyncLidMap(conn)
                } catch (_) {
                }
            }, 5000)
        }

        if (global.db.data == null) await loadDatabase()
    })

    return conn
}

// ═══════════════════════════════════════════════════════════════════
// reconnectBot — reconnect tanpa buat ulang auth state
// ═══════════════════════════════════════════════════════════════════
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
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    console.log('\x1b[33m[RECONNECT]\x1b[0m Reconnect ke-' + reconnectCount + ' dari ' + source + ' dalam ' + (delay / 1000) + 's...')

    await new Promise(resolve => {
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            resolve()
        }, delay)
    })
    isRestarting = false

    try {
        // FIXED: hanya lepas listener message handler, BUKAN creds.update/connection.update
        // removeAllListeners() di sini justru membunuh creds.update → session tidak tersimpan
        const oldConn = global.conn
        await destroySocket(oldConn)
        await createSocket()
        // FIXED: HAPUS explicit reloadHandler() di sini
        // reloadHandler() sudah dipanggil di connection.update → 'open'
        // Memanggil 2x menyebabkan duplicate messages.upsert listener → lag + double processing
        console.log('\x1b[32m[RECONNECT]\x1b[0m Socket baru berhasil dibuat ✓')
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

// ═══════════════════════════════════════════════════════════════════
// PLUGIN LOADER & RELOAD HANDLER
// ═══════════════════════════════════════════════════════════════════
function buildPluginRegistry() {
    const entries = []
    const allEntries = []
    const beforeEntries = []
    const exactCommandMap = new Map()

    for (const [name, plugin] of Object.entries(global.plugins || {})) {
        if (!plugin) continue

        const entry = {
            name,
            plugin,
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
    const pluginFolder = path.join(__dirname, 'plugins')
    const pluginFilter = f => /\.js$/.test(f)
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
        if (pluginReloadTimers.has(filename)) {
            clearTimeout(pluginReloadTimers.get(filename))
        }

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

    let isInit = true

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

        // FIXED: selalu lepas listener lama sebelum pasang baru
        // Mencegah duplicate listeners (penyebab lag + double processing)
        try { conn.ev.off('messages.upsert',          conn.handler)           } catch (_) {}
        try { conn.ev.off('group-participants.update', conn.participantsUpdate) } catch (_) {}
        try { conn.ev.off('message.delete',           conn.onDelete)           } catch (_) {}
        try { conn.ev.off('contacts.upsert',          conn.lidMapper)          } catch (_) {}
        try { conn.ev.off('contacts.update',          conn.lidMapper)          } catch (_) {}

        conn.welcome  = 'Hai, @user!\nSelamat datang di @subject\n\n@desc'
        conn.bye      = 'Selamat tinggal @user!'
        conn.spromote = '@user sekarang admin!'
        conn.sdemote  = '@user bukan admin lagi!'

        const boundHandler      = handler.handler.bind(conn)
        conn.handler            = async function (chatUpdate) {
            try {
                return await boundHandler(chatUpdate)
            } catch (e) {
                console.log('\x1b[31m[HANDLER]\x1b[0m Uncaught handler error: ' + (e?.message || e))
                if (e?.stack) console.log(String(e.stack).slice(0, 800))
            }
        }
        conn.participantsUpdate = handler.participantsUpdate.bind(conn)
        conn.onDelete           = handler.delete.bind(conn)

        conn.lidMapper = function(contacts) {
            if (!Array.isArray(contacts)) contacts = [contacts]
            if (!global.db?.data?.settings) return
            if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
            let mapped = 0
            for (const c of contacts) {
                if (c?.lid && c?.id && c.id.endsWith('@s.whatsapp.net')) {
                    const lid = c.lid.endsWith('@lid') ? c.lid : c.lid + '@lid'
                    const num = c.id.split('@')[0].split(':')[0]
                    global.db.data.settings.lidMap[lid] = num
                    mapped++
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

// ═══════════════════════════════════════════════════════════════════
// DB AUTO-SAVE setiap 30 detik
// ═══════════════════════════════════════════════════════════════════
if (!opts['test']) {
    setInterval(async () => {
        if (global.db.data) {
            await global.db.writeNow().catch(e =>
                console.log('\x1b[31m[DB]\x1b[0m Write error: ' + e.message)
            )
        }
    }, 120000)
}

// ═══════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS — bot tidak crash karena unhandled error
// ═══════════════════════════════════════════════════════════════════
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
    // TIDAK process.exit — biarkan bot tetap jalan
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

process.on('exit', () => {
    releaseInstanceLock()
})

// ═══════════════════════════════════════════════════════════════════
// BOOT SEQUENCE
// ═══════════════════════════════════════════════════════════════════
;(async () => {
    try {
        console.clear()
        console.log('\x1b[36m%s\x1b[0m', '╬' + '═'.repeat(40) + '╬')
        console.log('\x1b[36m%s\x1b[0m', '         ShiraoriBOT-V3          ')
        console.log('\x1b[36m%s\x1b[0m', '╩' + '═'.repeat(40) + '╩')
        console.log('')
        acquireInstanceLock()
        console.log('\x1b[32m[LOCK]\x1b[0m Session lock aktif untuk PID ' + process.pid)
        logSessionDiagnostics('startup')

        // STEP 1: Muat auth state (SEKALI SAJA — tidak diulang saat reconnect)
        console.log('\x1b[33m[1/3]\x1b[0m Memuat session...')
        await loadAuth()
        console.log('\x1b[32m[1/3]\x1b[0m Session OK ✓')

        // STEP 2: Fetch WA version
        console.log('\x1b[33m[2/3]\x1b[0m Menyiapkan versi WhatsApp...')
        let version = null
        if (SHOULD_FETCH_LATEST_VERSION) {
            try {
            const res = await Promise.race([
                fetchLatestBaileysVersion(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
            ])
            version = res.version
            console.log('\x1b[32m[2/3]\x1b[0m WA version: ' + version.join('.') + ' ✓')
            } catch (e) {
                console.log('\x1b[33m[2/3]\x1b[0m Gagal fetch versi terbaru, pakai versi bawaan library.')
            }
        } else {
            console.log('\x1b[32m[2/3]\x1b[0m Pakai versi bawaan Baileys (lebih stabil untuk reconnect).')
        }

        // STEP 3: Inisialisasi plugin & handler
        console.log('\x1b[33m[3/3]\x1b[0m Memuat plugin...')
        initPluginsAndHandler()

        // STEP 4: Buat socket pertama
        await createSocket(version)

        // STEP 5: Jika sudah registered (session ada), langsung pasang handler
        if (globalState.creds.registered) {
            global.reloadHandler()
        }

        // STEP 6: Request pairing code jika belum registered
        if (!useMobile && !globalState.creds.registered) {
            let phoneNumber = pairingNumber
            if (!phoneNumber) {
                phoneNumber = await question('\x1b[33mMasukkan nomor WA (contoh: 6281234567890): \x1b[0m')
            }
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '').trim()

            if (!phoneNumber || phoneNumber.length < 10) {
                console.log('\x1b[31m%s\x1b[0m', 'Nomor tidak valid!')
                process.exit(0)
            }

            console.log('\x1b[33m[PAIRING]\x1b[0m Nomor: +' + phoneNumber)
            console.log('\x1b[33m[PAIRING]\x1b[0m Menunggu WebSocket siap (3 detik)...')
            await new Promise(r => setTimeout(r, 3000))

            try {
                let code = await global.conn.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join('-') || code
                console.log('')
                console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════╗')
                console.log('\x1b[36m%s\x1b[0m', '║      PAIRING CODE BOT        ║')
                console.log('\x1b[32m%s\x1b[0m', '║  >>  ' + code + '  <<        ║')
                console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════╝')
                console.log('')
                console.log('\x1b[33m%s\x1b[0m', '📱 WA > ⋮ > Perangkat Tertaut > Tautkan dengan nomor telepon')
                console.log('')
            } catch (e) {
                console.log('\x1b[31m[PAIRING]\x1b[0m Gagal: ' + e.message)
                console.log('\x1b[33m[PAIRING]\x1b[0m Solusi: rm -rf session/ lalu restart')
                process.exit(1)
            }
        }

        console.log('')
        console.log('\x1b[36m%s\x1b[0m', '═'.repeat(42))
        console.log('\x1b[32m%s\x1b[0m', '  Bot berhasil diinisialisasi!')
        console.log('\x1b[36m%s\x1b[0m', '═'.repeat(42))
        console.log('')

    } catch (err) {
        console.log('\x1b[31m[FATAL]\x1b[0m ' + formatErrorBrief(err))
        if (err?.stack) console.log(String(err.stack).slice(0, 500))
        process.exit(1)
    }
})()

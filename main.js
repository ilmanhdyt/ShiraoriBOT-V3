// ============================================================
//   SHIRAORI WHATSAPP BOT 
//   
// ============================================================

require('./config')  

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    proto,
    makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys')

const path   = require('path')
const fs     = require('fs')
const NodeCache = require('node-cache')
const yargs  = require('yargs/yargs')
const cp     = require('child_process')
const _      = require('lodash')
const syntaxerror = require('syntax-error')
const P      = require('pino')
const os     = require('os')
const { Boom } = require('@hapi/boom')
const readline  = require('readline')
const qrcode = require('qrcode-terminal')

const pairingcode  = process.argv.includes('--pairing-code')
const useMobile    = process.argv.includes('--mobile')
const pairingNumber = process.env.PAIRING_NUMBER || ''

let simple = require('./lib/simple')

const { Low, JSONFile } = require('./lib/lowdb')
const mongoDB = require('./lib/mongoDB')

// Global helpers
global.API = (name, p = '/', query = {}, apikeyqueryname) =>
    (name in global.APIs ? global.APIs[name] : name) +
    p +
    (query || apikeyqueryname
        ? '?' + new URLSearchParams(Object.entries({
            ...query,
            ...(apikeyqueryname ? { [apikeyqueryname]: global.APIKeys[name in global.APIs ? global.APIs[name] : name] } : {})
          }))
        : '')

global.timestamp = { start: new Date() }

const PORT = process.env.PORT || 3000

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.prefix = new RegExp(
    '^[' +
    (opts['prefix'] || '\u200exzXZ/i!#$%+\u00a3\u00a2\u20ac\u00a5^\u00b0=\u00b6\u2206\u00d7\u00f7\u03c0\u221a\u2713\u00a9\u00ae:;?&.\\-')
        .replace(/[|\\{}()[\]^$+*?.\-\^]/g, '\\$&') +
    ']'
)

// Database setup
global.db = new Low(
    /https?:\/\//.test(opts['db'] || '')
        ? new cloudDBAdapter(opts['db'])
        : /mongodb/.test(opts['db'])
            ? new mongoDB(opts['db'])
            : new JSONFile((opts._[0] ? opts._[0] + '_' : '') + 'database.json')
)
global.DATABASE = global.db

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
    global.db.chain = _.chain(global.db.data)
}
loadDatabase()

const question = text => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => rl.question(text, ans => { rl.close(); resolve(ans) }))
}

async function startBot() {
    console.clear()
    console.log('\x1b[36m%s\x1b[0m', '\u256c' + '\u2550'.repeat(40) + '\u256c')
    console.log('\x1b[36m%s\x1b[0m', '       NIA-AI WHATSAPP BOT v2.2 (FIXED)  ')
    console.log('\x1b[36m%s\x1b[0m', '\u2569' + '\u2550'.repeat(40) + '\u2569')
    console.log('')

    global.authFile = 'session'

    
    console.log('\x1b[33m%s\x1b[0m', 'Loading session...')
    let state, saveCreds
    try {
        if (!fs.existsSync('./' + global.authFile)) {
            fs.mkdirSync('./' + global.authFile, { recursive: true })
        }
        const authResult = await useMultiFileAuthState('./' + global.authFile)
        state = authResult.state
        saveCreds = authResult.saveCreds
        console.log('\x1b[32m%s\x1b[0m', 'Session loaded OK')
    } catch (e) {
        console.log('\x1b[31m%s\x1b[0m', 'Session error: ' + e.message)
        console.log('\x1b[33m%s\x1b[0m', 'Coba: hapus folder session/ lalu restart')
        process.exit(1)
    }

 
    console.log('\x1b[33m%s\x1b[0m', 'Checking WhatsApp version...')
    let version = [2, 3000, 1015901307]
    try {
        const res = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ])
        version = res.version
        console.log('\x1b[32m%s\x1b[0m', 'WhatsApp v' + version.join('.'))
    } catch (_) {
        console.log('\x1b[33m%s\x1b[0m', 'Menggunakan versi fallback (koneksi lambat/offline)')
    }

    const msgRetryCounterCache = new NodeCache()

    const connectionOptions = {
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        mobile: useMobile,
        browser: ['NIA-AI Bot', 'Safari', '3.0'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
        },
        msgRetryCounterCache,
        generateHighQualityLinkPreview: true,
        getMessage: async () => ({ conversation: 'hello' })
    }

    global.conn = simple.makeWASocket(connectionOptions)

    if (!opts['test']) {
        setInterval(async () => {
            if (global.db.data) await global.db.write().catch(e => console.log('DB write error:', e.message))
        }, 30000)
    }

    async function connectionUpdate(update) {
        const { connection, lastDisconnect, isNewLogin, qr } = update

        if (qr) {
            console.log('\n' + '='.repeat(50))
            console.log('  QR CODE - Scan dengan WhatsApp kamu!')
            console.log('='.repeat(50) + '\n')
            qrcode.generate(qr, { small: true })
            console.log('\n' + '='.repeat(50))
            console.log('  Cara scan:')
            console.log('  1. Buka WhatsApp di HP')
            console.log('  2. Pengaturan > Perangkat Tertaut')
            console.log('  3. Tautkan Perangkat > Scan QR')
            console.log('='.repeat(50) + '\n')
        }

        global.stopped = connection

        if (isNewLogin) {
            global.db.data = { users: {}, chats: {}, stats: {}, msgs: {}, sticker: {}, settings: {} }
        }

        if (connection === 'close') {
            let reason
            try { reason = new Boom(lastDisconnect?.error)?.output?.statusCode } catch (_) { reason = 0 }

            if (reason === DisconnectReason.badSession) {
                console.log('\x1b[31m%s\x1b[0m', 'Bad session. Hapus folder session/ dan scan ulang.')
                process.exit(1)
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log('\x1b[31m%s\x1b[0m', 'Sesi digantikan. Tutup sesi lain dulu.')
                process.exit(1)
            } else if (reason === DisconnectReason.loggedOut) {
                console.log('\x1b[31m%s\x1b[0m', 'Logged out. Hapus session/ dan scan ulang.')
                process.exit(1)
            } else {
                console.log('\x1b[33m%s\x1b[0m', 'Koneksi terputus (reason: ' + reason + '). Reconnecting...')
                setTimeout(() => startBot(), 3000)
            }
        }

        if (connection === 'open') {
            console.log('\x1b[32m%s\x1b[0m', 'Terhubung ke WhatsApp!')
            console.log('\x1b[32m%s\x1b[0m', 'Bot siap digunakan!')
            console.log('')
        }

        if (global.db.data == null) await loadDatabase()
    }

    if (pairingcode && !conn.authState.creds.registered) {
        if (useMobile) throw new Error('Tidak bisa pakai pairing code dengan mobile API')

        let phoneNumber = pairingNumber || await question('Masukkan nomor WA (contoh: 6281234567890): ')
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        if (phoneNumber.length < 10) {
            console.log('Nomor tidak valid. Format: 62xxx')
            process.exit(0)
        }

        setTimeout(async () => {
            let code = await conn.requestPairingCode(phoneNumber)
            code = code?.match(/.{1,4}/g)?.join('-') || code
            console.log('\x1b[32m%s\x1b[0m', '\nPairing Code: ' + code + '\n')
        }, 3000)
    }

    process.removeAllListeners('uncaughtException')
    process.removeAllListeners('unhandledRejection')

  
    const ignoredErrors = [
        'Cannot destructure property', 'remoteJid', 'Closing open session',
        'Closing session', 'unhandledRejection', 'Connection Failure',
        'connection closing', 'ECONNRESET', 'ETIMEDOUT', 'Socket connection timeout',
        'read ECONNRESET', 'write ECONNRESET', 'connect ECONNREFUSED',
    ]
    const isIgnored = msg => ignoredErrors.some(e => String(msg).includes(e))

    process.on('uncaughtException', err => {
        if (err && err.message && !isIgnored(err.message))
            console.log('\x1b[31m%s\x1b[0m', '[Error]', err.message)
    })

    process.on('unhandledRejection', reason => {
        if (!isIgnored(reason))
            console.log('\x1b[33m%s\x1b[0m', '[Warn]', String(reason).slice(0, 150))
    })

    const importModule = filePath => {
        filePath = require.resolve(filePath)
        if (filePath in require.cache) delete require.cache[filePath]
        return require(filePath)
    }

    let isInit = true
    global.reloadHandler = function (restatConn) {
        let handler
        try {
            handler = importModule('./handler')
        } catch (e) {
            console.log('\x1b[31m%s\x1b[0m', 'Error loading handler: ' + e.message)
            return false
        }

        if (restatConn) {
            try { global.conn.ws.close() } catch (_) {}
            global.conn = { ...global.conn, ...simple.makeWASocket(connectionOptions) }
        }

        if (!isInit) {
            conn.ev.off('messages.upsert', conn.handler)
            conn.ev.off('group-participants.update', conn.participantsUpdate)
            conn.ev.off('message.delete', conn.onDelete)
            conn.ev.off('connection.update', conn.connectionUpdate)
            conn.ev.off('creds.update', conn.credsUpdate)
        }

        conn.welcome  = 'Hai, @user!\nSelamat datang di @subject\n\n@desc'
        conn.bye      = 'Selamat tinggal @user!'
        conn.spromote = '@user sekarang admin!'
        conn.sdemote  = '@user bukan admin lagi!'

        conn.handler            = handler.handler.bind(conn)
        conn.participantsUpdate = handler.participantsUpdate.bind(conn)
        conn.onDelete           = handler.delete.bind(conn)
        conn.connectionUpdate   = connectionUpdate.bind(conn)
        conn.credsUpdate        = saveCreds.bind(conn)

        conn.ev.on('messages.upsert',          conn.handler)
        conn.ev.on('group-participants.update', conn.participantsUpdate)
        conn.ev.on('message.delete',           conn.onDelete)
        conn.ev.on('connection.update',        conn.connectionUpdate)
        conn.ev.on('creds.update',             conn.credsUpdate)

        isInit = false
        return true
    }

    const pluginFolder = path.join(__dirname, 'plugins')
    const pluginFilter = f => /\.js$/.test(f)
    global.plugins = {}

    for (let filename of fs.readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            global.plugins[filename] = require(path.join(pluginFolder, filename))
        } catch (e) {
            console.log('\x1b[33m%s\x1b[0m', 'Plugin error [' + filename + ']: ' + e.message)
        }
    }
    console.log('\x1b[32m%s\x1b[0m', Object.keys(global.plugins).length + ' plugin dimuat')

    global.reload = (_ev, filename) => {
        if (!pluginFilter(filename)) return
        let dir = path.join(pluginFolder, filename)
        if (dir in require.cache) delete require.cache[dir]
        if (!fs.existsSync(dir)) {
            console.log('Plugin dihapus: ' + filename)
            return delete global.plugins[filename]
        }
        let err = syntaxerror(fs.readFileSync(dir), filename)
        if (err) {
            console.error('Syntax error di ' + filename + ': ' + err)
        } else {
            try {
                global.plugins[filename] = require(dir)
                console.log('Plugin diperbarui: ' + filename)
            } catch (e) {
                console.error(e)
            }
        }
    }
    Object.freeze(global.reload)
    fs.watch(pluginFolder, global.reload)

    global.reloadHandler()

    console.log('')
    console.log('\x1b[36m%s\x1b[0m', '='.repeat(42))
    console.log('\x1b[32m%s\x1b[0m', '  Bot berhasil diinisialisasi!')
    console.log('\x1b[33m%s\x1b[0m', '  Menunggu QR code atau koneksi...')
    console.log('\x1b[36m%s\x1b[0m', '='.repeat(42))
    console.log('')
}

startBot().catch(err => {
    console.log('\x1b[31m%s\x1b[0m', 'FATAL: Gagal menjalankan bot')
    console.log('\x1b[31m%s\x1b[0m', err.message || err)
    console.log(err)
    process.exit(1)
})
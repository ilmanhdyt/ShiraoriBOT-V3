// lib/telegram.js - Notifikasi Telegram + Heartbeat System
// Solusi untuk SIGKILL / Codespace stop mendadak
//
// Cara kerja heartbeat:
// 1. Bot kirim pesan "masih hidup" ke Telegram setiap 10 menit
// 2. Di Telegram, buat bot kedua (atau gunakan bot yang sama) untuk
//    monitor: jika tidak ada heartbeat dalam 15 menit → kirim alert
// 3. Solusi sederhana: edit pesan heartbeat yang sama (tidak spam)

const https = require('https')
const qrcode = require('qrcode')

// ─── Konfigurasi ──────────────────────────────────────────────────────────────
// Isi di config.js atau .env:
//   global.telegramToken  = 'TOKEN_BOT_TELEGRAM'
//   global.telegramChatId = 'CHAT_ID_KAMU'

function getToken()  { return global.telegramToken  || process.env.TELEGRAM_TOKEN  || '' }
function getChatId() { return global.telegramChatId || process.env.TELEGRAM_CHAT_ID || '' }

// ─── Request helper ───────────────────────────────────────────────────────────
function telegramRequest(method, body) {
    return new Promise((resolve, reject) => {
        const token = getToken()
        if (!token || !getChatId()) return resolve(null)

        const payload = JSON.stringify(body)
        const options = {
            hostname: 'api.telegram.org',
            path    : `/bot${token}/${method}`,
            method  : 'POST',
            headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        }

        const req = https.request(options, res => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try { resolve(JSON.parse(data)) } catch { resolve(data) }
            })
        })
        req.on('error', reject)
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
        req.write(payload)
        req.end()
    })
}

// ─── Kirim pesan biasa ────────────────────────────────────────────────────────
async function sendMessage(text, extra = {}) {
    return telegramRequest('sendMessage', {
        chat_id   : getChatId(),
        text,
        parse_mode: 'Markdown',
        ...extra,
    }).catch(() => null)
}

// ─── Edit pesan (untuk heartbeat) ─────────────────────────────────────────────
async function editMessage(messageId, text) {
    return telegramRequest('editMessageText', {
        chat_id   : getChatId(),
        message_id: messageId,
        text,
        parse_mode: 'Markdown',
    }).catch(() => null)
}

// ─── Kirim QR Code ke Telegram ────────────────────────────────────────────────
async function sendQR(qrString) {
    try {
        const buffer = await qrcode.toBuffer(qrString, { scale: 8 })
        return new Promise((resolve, reject) => {
            const token = getToken()
            if (!token || !getChatId()) return resolve(null)

            const boundary = '----FormBoundary' + Math.random().toString(36)
            const caption  = '📱 *Scan QR Code ini untuk login WhatsApp Bot!*'
            let body = ''
            body += `--${boundary}\r\n`
            body += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${getChatId()}\r\n`
            body += `--${boundary}\r\n`
            body += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
            body += `--${boundary}\r\n`
            body += `Content-Disposition: form-data; name="photo"; filename="qr.png"\r\n`
            body += `Content-Type: image/png\r\n\r\n`

            const bodyBuffer = Buffer.concat([
                Buffer.from(body),
                buffer,
                Buffer.from(`\r\n--${boundary}--\r\n`)
            ])

            const options = {
                hostname: 'api.telegram.org',
                path    : `/bot${token}/sendPhoto`,
                method  : 'POST',
                headers : {
                    'Content-Type'  : `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': bodyBuffer.length,
                },
            }

            const req = https.request(options, res => {
                let data = ''
                res.on('data', chunk => data += chunk)
                res.on('end', () => resolve(data))
            })
            req.on('error', reject)
            req.write(bodyBuffer)
            req.end()
        })
    } catch (e) {
        return sendMessage('📱 QR Code tersedia di terminal. Silakan scan.')
    }
}

// ─── Notifikasi online ────────────────────────────────────────────────────────
async function notifyOnline(botName = 'ShiraoriBOT') {
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    return sendMessage(
        `✅ *${botName} Online!*\n\n` +
        `🕐 Waktu : ${now}\n` +
        `🌍 Platform: ${detectPlatform()}`
    )
}

// ─── Notifikasi offline (disconnect, bukan mati total) ────────────────────────
async function notifyOffline(reason = '', botName = 'ShiraoriBOT') {
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    return sendMessage(
        `⚠️ *${botName} Terputus!*\n\n` +
        `🕐 Waktu : ${now}\n` +
        `📛 Alasan: ${reason}\n` +
        `🔄 Mencoba reconnect...`
    )
}

// ─── Deteksi platform ─────────────────────────────────────────────────────────
function detectPlatform() {
    const env = process.env
    if (env.CODESPACES === 'true' || env.GITHUB_CODESPACE_TOKEN) return '☁️ GitHub Codespaces'
    if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID)        return '🚂 Railway'
    if (env.DYNO)                                                  return '🟣 Heroku'
    if (env.REPL_ID || env.REPL_SLUG)                             return '🔁 Replit'
    if (env.RENDER || env.RENDER_SERVICE_ID)                       return '🎨 Render'
    if (env.TERM_PROGRAM === 'vscode' || env.VSCODE_PID)          return '💙 VSCode'
    if (env.TERMUX_VERSION)                                        return '📱 Termux'
    if (process.platform === 'linux' && !env.DISPLAY)             return '🖥️ VPS/Server'
    return '💻 Lokal'
}

// ═══════════════════════════════════════════════════════════════
// HEARTBEAT SYSTEM
// Solusi untuk SIGKILL / Codespace stop mendadak
// ═══════════════════════════════════════════════════════════════
let heartbeatMessageId = null   // ID pesan heartbeat yang diedit terus
let heartbeatInterval  = null
let heartbeatCount     = 0

async function startHeartbeat(botName = 'ShiraoriBOT', intervalMinutes = 10) {
    if (heartbeatInterval) clearInterval(heartbeatInterval)

    const intervalMs = intervalMinutes * 60 * 1000

    // Kirim pesan heartbeat pertama
    async function sendHeartbeat() {
        heartbeatCount++
        const now    = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        const uptime = formatUptime(process.uptime())
        const mem    = process.memoryUsage()
        const memMB  = Math.round(mem.heapUsed / 1024 / 1024)

        const text =
            `💓 *${botName} - Heartbeat #${heartbeatCount}*\n\n` +
            `🟢 Status  : Online\n` +
            `🕐 Waktu   : ${now}\n` +
            `⏱️ Uptime  : ${uptime}\n` +
            `🧠 Memory  : ${memMB} MB\n` +
            `🌍 Platform: ${detectPlatform()}\n\n` +
            `_Update setiap ${intervalMinutes} menit_\n` +
            `_Jika pesan ini berhenti update → bot mati!_`

        if (heartbeatMessageId) {
            // Edit pesan yang sama (tidak spam)
            const result = await editMessage(heartbeatMessageId, text)
            // Jika edit gagal (pesan terlalu lama/dihapus), kirim baru
            if (!result?.ok) {
                const sent = await sendMessage(text)
                if (sent?.result?.message_id) heartbeatMessageId = sent.result.message_id
            }
        } else {
            // Kirim pesan baru pertama kali
            const sent = await sendMessage(text)
            if (sent?.result?.message_id) heartbeatMessageId = sent.result.message_id
        }
    }

    // Kirim langsung sekarang
    await sendHeartbeat()

    // Lalu ulangi setiap X menit
    heartbeatInterval = setInterval(sendHeartbeat, intervalMs)
    console.log(`\x1b[36m%s\x1b[0m`, `[Telegram] Heartbeat aktif (setiap ${intervalMinutes} menit)`)
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
    }
}

// ─── Format uptime ─────────────────────────────────────────────────────────────
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (d > 0) return `${d}h ${h}j ${m}m`
    if (h > 0) return `${h}j ${m}m ${s}d`
    if (m > 0) return `${m}m ${s}d`
    return `${s}d`
}

module.exports = {
    sendMessage,
    sendQR,
    notifyOnline,
    notifyOffline,
    startHeartbeat,
    stopHeartbeat,
    detectPlatform,
}
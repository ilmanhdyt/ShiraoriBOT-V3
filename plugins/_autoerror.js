// plugins/_autoerror.js
// Auto kirim error ke grup yang ditentukan + tag owner + saran fix AI
//
// Setup di config.js:
//   global.errorGroup = '120363425294318971@g.us'  // ID grup tujuan error
//
// Cara dapat ID grup: kirim pesan di grup, lihat di console (format: 120363xxx@g.us)

const fetch = require('node-fetch')

// ── Tabel saran fix common error ─────────────────────────────────
const ERROR_HINTS = [
    {
        pattern: /cannot read prop|cannot read properties|is not a function/i,
        hint: '💡 *Kemungkinan Fix:*\nVariabel/objek bernilai null/undefined. Tambahkan pengecekan:\n`if (!variable) return`'
    },
    {
        pattern: /enospc|no space left/i,
        hint: '💡 *Kemungkinan Fix:*\nStorage penuh! Jalankan *.cleartmp* untuk bersihkan folder tmp/'
    },
    {
        pattern: /econnrefused|econnreset|etimedout|socket hang/i,
        hint: '💡 *Kemungkinan Fix:*\nKoneksi internet/API gagal. Cek koneksi VPS atau API yang dipakai.'
    },
    {
        pattern: /module not found|cannot find module/i,
        hint: '💡 *Kemungkinan Fix:*\nModule belum diinstall. Jalankan:\n`npm install <nama-module>`'
    },
    {
        pattern: /syntax ?error|unexpected token|unexpected end/i,
        hint: '💡 *Kemungkinan Fix:*\nAda kesalahan penulisan kode. Cek bracket `{}`, tanda koma, atau kutip yang tidak lengkap.'
    },
    {
        pattern: /timeout/i,
        hint: '💡 *Kemungkinan Fix:*\nRequest timeout. API terlalu lambat, tambahkan retry atau tingkatkan timeout.'
    },
    {
        pattern: /permission denied|eacces/i,
        hint: '💡 *Kemungkinan Fix:*\nTidak ada izin akses file/folder. Jalankan:\n`chmod -R 755 <folder>`'
    },
    {
        pattern: /json.*parse|unexpected.*json|not valid json/i,
        hint: '💡 *Kemungkinan Fix:*\nResponse bukan JSON valid. Wrap dengan try-catch saat parsing JSON.'
    },
    {
        pattern: /type ?error.*in operator/i,
        hint: '💡 *Kemungkinan Fix:*\nOperator `in` dipakai pada nilai bukan objek. Pastikan variabel adalah object sebelum dicek.'
    },
    {
        pattern: /range ?error|maximum call stack/i,
        hint: '💡 *Kemungkinan Fix:*\nRecursion tak terbatas atau array terlalu besar. Cek fungsi yang memanggil dirinya sendiri.'
    },
]

function getLocalHint(errorMsg) {
    for (const { pattern, hint } of ERROR_HINTS) {
        if (pattern.test(errorMsg)) return hint
    }
    return null
}

// ── Minta saran fix dari Anthropic API ───────────────────────────
async function getAISuggestion(pluginName, errorMsg) {
    try {
        const apiKey = global.anthropic_key || process.env.ANTHROPIC_API_KEY
        if (!apiKey) return null

        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{
                    role: 'user',
                    content:
                        `Plugin WhatsApp bot bernama "${pluginName}" mengalami error berikut:\n\n` +
                        `${errorMsg}\n\n` +
                        `Berikan saran singkat cara fix error ini dalam 2-3 kalimat. ` +
                        `Gunakan bahasa Indonesia. Langsung ke solusi, tanpa basa-basi.`
                }]
            })
        })

        const data = await res.json()
        return data?.content?.[0]?.text || null
    } catch (_) {
        return null
    }
}

// ── Format error message ──────────────────────────────────────────
function formatError(err) {
    if (typeof err === 'string') return err
    if (err instanceof Error) return err.message + (err.stack ? '\n' + err.stack.split('\n').slice(1, 4).join('\n') : '')
    return String(err)
}

// ── Kirim notif error ke grup ─────────────────────────────────────
async function sendErrorNotif(conn, pluginName, errorMsg, m = null) {
    const groupId = global.errorGroup
    if (!groupId) return  // Tidak ada grup yang ditentukan

    try {
        const ownerMentions = (global.owner || []).map(n => n.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
        const ownerTags     = ownerMentions.map(j => `@${j.split('@')[0].split(':')[0]}`).join(' ')

        // Cek hint lokal dulu (lebih cepat)
        let fixSuggestion = getLocalHint(errorMsg)

        // Kalau tidak ada hint lokal, tanya AI
        if (!fixSuggestion) {
            const aiSuggestion = await getAISuggestion(pluginName, errorMsg)
            if (aiSuggestion) fixSuggestion = `🤖 *Saran AI:*\n${aiSuggestion}`
        }

        const chatInfo = m
            ? `💬 *Chat:* ${m.isGroup ? (m.chat || '-') : 'Private'}\n` +
              `👤 *Dari:* @${(m.sender || '').split('@')[0].split(':')[0]}\n`
            : ''

        const text =
            `╔══════════════════╗\n` +
            `  ⚠️ *ERROR REPORT*\n` +
            `╚══════════════════╝\n\n` +
            `📄 *Plugin:* \`${pluginName}\`\n` +
            chatInfo +
            `⏰ *Waktu:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' })}\n\n` +
            `❌ *Error:*\n\`\`\`${errorMsg.slice(0, 500)}\`\`\`\n\n` +
            (fixSuggestion ? fixSuggestion + '\n\n' : '') +
            `🏷️ *Owner:* ${ownerTags}`

        await conn.sendMessage(groupId, {
            text,
            mentions: ownerMentions
        })
    } catch (e) {
        console.log('[autoerror] Gagal kirim notif:', e.message)
    }
}

// ── Plugin handler (hook ke semua pesan) ─────────────────────────
let handler = async (m, { conn }) => {}


// ── Patch handler.js error catcher ───────────────────────────────
// Inject ke global agar bisa dipanggil dari handler.js
global.sendErrorNotif = sendErrorNotif

handler.help     = []
handler.tags     = ['system']
handler.command  = false
handler.disabled = false

module.exports = handler
module.exports.sendErrorNotif = sendErrorNotif

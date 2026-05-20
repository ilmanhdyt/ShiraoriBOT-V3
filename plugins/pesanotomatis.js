// pesanotomatis.js
// Kirim pesan otomatis ke grup/user lewat bot
//
// Cara pakai:
//   .pesanotomatis <jid> <pesan>
//   .pesanotomatis <jid>        ← reply pesan / media
//   .kirimke <jid> <pesan>
//   .broadcastowner <pesan>     ← blast ke semua grup yang bot ada
//
// Contoh:
//   .pesanotomatis 120363xxxxxx@g.us Halo semua!
//   .pesanotomatis 6281234567890 Halo kak!
//   .broadcastowner Pengumuman: bot akan maintenance jam 12 malam

const fs   = require('fs')
const path = require('path')
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys')

// ── Utilitas ───────────────────────────────────────────────────────────────

/**
 * Ambil buffer gambar menu_bg (kandidat berurutan)
 */
function getMenuImage() {
    const candidates = [
        path.join(__dirname, '../media/menu_bg.jpg'),
        path.join(__dirname, '../media/shiraori.jpg'),
        path.join(__dirname, '../media/esce.jpg'),
    ]
    for (const p of candidates) {
        try { if (fs.existsSync(p)) return fs.readFileSync(p) } catch (_) {}
    }
    return null
}

/**
 * Normalisasi JID:
 *   - Angka saja          → 628xxx@s.whatsapp.net  (personal)
 *   - Angka@g.us          → biarkan
 *   - Angka@s.whatsapp.net → biarkan
 *   - ID grup numerik (≥15 digit) → @g.us
 */
function normalizeJid(input) {
    if (!input) return null
    input = input.trim()
    if (input.includes('@')) return input
    const digits = input.replace(/[^0-9]/g, '')
    if (!digits) return null
    return digits + '@s.whatsapp.net'
}

/**
 * Normalisasi JID grup untuk keperluan lookup/compare.
 */
function normalizeGroupJidForLookup(jid) {
    if (!jid || typeof jid !== 'string') return null
    const atIdx = jid.indexOf('@')
    if (atIdx === -1) return null
    const local  = jid.slice(0, atIdx).split(':')[0]
    const server = jid.slice(atIdx + 1).split(':')[0]
    if (server !== 'g.us') return null
    if (!local) return null
    return local + '@g.us'
}

/**
 * Cek apakah bot ada di dalam grup via groupFetchAllParticipating()
 */
async function botInGroup(conn, jid) {
    try {
        const normalizedTarget = normalizeGroupJidForLookup(jid)
        if (!normalizedTarget) return false
        const groups = await conn.groupFetchAllParticipating()
        if (!groups) return false
        for (const key of Object.keys(groups)) {
            const normalizedKey = normalizeGroupJidForLookup(key)
            if (normalizedKey === normalizedTarget) return true
        }
        return false
    } catch (e) {
        console.log('[PESANOTOMATIS] botInGroup error:', e.message)
        return false
    }
}

/**
 * Kirim broadcast interaktif: gambar + caption + button + footer
 * Menggunakan pola nativeFlowMessage (sama persis dengan hai.js)
 */
async function sendBroadcastInteractive(conn, jid, pesanBroadcast) {
    const botName = global.namabot || 'ShiraoriBOT'
    const wm      = global.wm || botName
    const imgBuf  = getMenuImage()

    const bodyText =
        `👑 *PESAN BROADCAST DARI OWNER* 🤴\n\n` +
        `${pesanBroadcast}`

    const buttons = [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '📋 Menu',        id: '.menu'  }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '👑 Owner',       id: '.owner' }) },
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: '🔗 Source Code', id: '.sc'    }) },
    ]

    try {
        // ── Siapkan header (gambar atau teks) ──────────────────────────────
        let header
        if (imgBuf) {
            try {
                const uploaded = await prepareWAMessageMedia(
                    { image: imgBuf },
                    { upload: conn.waUploadToServer }
                )
                header = proto.Message.InteractiveMessage.Header.create({
                    ...uploaded,
                    hasMediaAttachment: true,
                })
            } catch (e) {
                console.warn('[BROADCAST] prepareWAMessageMedia gagal, pakai header teks:', e.message)
                header = { title: botName, hasMediaAttachment: false }
            }
        } else {
            header = { title: botName, hasMediaAttachment: false }
        }

        // ── Bangun interactiveMessage ──────────────────────────────────────
        const msg = generateWAMessageFromContent(
            jid,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {},
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            header,
                            body  : { text: bodyText },
                            footer: { text: wm },
                            nativeFlowMessage: { buttons },
                        }),
                    },
                },
            },
            { userJid: conn.user.id }
        )

        await conn.relayMessage(jid, msg.message, { messageId: msg.key.id })

    } catch (e) {
        // Fallback: gambar+caption tanpa tombol interaktif
        console.warn('[BROADCAST] interactiveMessage gagal, fallback:', e.message)
        if (imgBuf) {
            await conn.sendMessage(jid, { image: imgBuf, caption: bodyText, mimetype: 'image/jpeg' })
        } else {
            await conn.sendMessage(jid, { text: bodyText })
        }
    }
}

// ── Handler Utama ──────────────────────────────────────────────────────────

let handler = async (m, { conn, args, usedPrefix, command, text }) => {

    // ── .broadcastowner <pesan> ─────────────────────────────────────────────
    if (/^broadcastowner$/i.test(command)) {
        const pesanBroadcast = text?.trim()
        if (!pesanBroadcast) throw `❌ Masukkan pesan broadcast!\n\n*Contoh:*\n${usedPrefix}broadcastowner Pengumuman penting untuk semua grup!`

        let semuaGrup = []
        try {
            const chats = await conn.groupFetchAllParticipating()
            semuaGrup = Object.keys(chats || {})
        } catch (e) {
            throw `❌ Gagal ambil daftar grup: ${e.message}`
        }

        if (!semuaGrup.length) throw `❌ Bot belum ada di grup manapun!`

        await conn.reply(m.chat,
`📡 *Broadcast dimulai...*
📦 Total grup: *${semuaGrup.length}*
⏳ Mohon tunggu...`, m)

        let berhasil = 0
        let gagal    = 0
        const gagalList = []

        for (const jid of semuaGrup) {
            try {
                await sendBroadcastInteractive(conn, jid, pesanBroadcast)
                berhasil++
                // Delay anti-spam 1.2 detik antar kirim
                await new Promise(r => setTimeout(r, 1200))
            } catch (e) {
                gagal++
                gagalList.push(jid)
                console.log(`[BROADCAST] Gagal ke ${jid}: ${e.message}`)
            }
        }

        return conn.reply(m.chat,
`✅ *Broadcast selesai!*

📤 Terkirim   : *${berhasil}* grup
❌ Gagal       : *${gagal}* grup${gagal > 0 ? '\n\n*Gagal ke:*\n' + gagalList.map(j => `• ${j}`).join('\n') : ''}`, m)
    }

    // ── .pesanotomatis / .kirimke ───────────────────────────────────────────

    if (!args[0]) throw `❌ Format salah!\n\n*Cara pakai:*\n${usedPrefix}${command} <jid/nomor> <pesan>\n\n*Contoh:*\n${usedPrefix}${command} 120363xxxxxx@g.us Halo semua!\n${usedPrefix}${command} 6281234567890 Halo kak!\n\n💡 _Bisa juga reply media/pesan untuk diteruskan ke target_`

    const targetRaw = args[0]
    const targetJid = normalizeJid(targetRaw)

    if (!targetJid) throw `❌ JID tidak valid!\n\nContoh format:\n• \`120363xxxxxx@g.us\`  ← grup baru\n• \`6283102255420-1624004958@g.us\` ← grup lama\n• \`6281234567890\`     ← personal\n• \`6281234567890@s.whatsapp.net\``

    const pesanTeks = args.slice(1).join(' ').trim()
    const quoted    = m.quoted

    const adaTeks   = pesanTeks.length > 0
    const adaQuoted = !!quoted

    if (!adaTeks && !adaQuoted) {
        throw `❌ Masukkan pesan atau reply sebuah pesan/media!\n\n*Contoh:*\n${usedPrefix}${command} ${targetRaw} Ini pesan yang mau dikirim\n\n_atau reply pesan/gambar/video dengan:_\n${usedPrefix}${command} ${targetRaw}`
    }

    // Cek apakah target adalah grup dan bot ada di sana
    if (targetJid.endsWith('@g.us')) {
        const inGroup = await botInGroup(conn, targetJid)
        if (!inGroup) throw `❌ Bot tidak ada di grup tersebut!\nJID: \`${targetJid}\`\n\nMasukkan bot ke grup dulu.\n\n💡 _Tip: Pastikan JID disalin dari perintah .jidgrup_`
    }

    // ── Kirim: forward quoted message (media/pesan) ─────────────────────────
    if (adaQuoted) {
        try {
            if (adaTeks) {
                await conn.sendMessage(targetJid, { text: pesanTeks })
                await new Promise(r => setTimeout(r, 500))
            }

            const msgType = Object.keys(quoted.message || {})[0] || 'conversation'

            if (['imageMessage', 'videoMessage', 'audioMessage',
                 'documentMessage', 'stickerMessage'].includes(msgType)) {
                const media   = await quoted.download()
                const mime    = quoted.message?.[msgType]?.mimetype || 'application/octet-stream'
                const caption = quoted.message?.[msgType]?.caption || ''

                const mediaSendMap = {
                    imageMessage:    { image:    media, caption },
                    videoMessage:    { video:    media, caption },
                    audioMessage:    { audio:    media, mimetype: mime, ptt: quoted.message[msgType]?.ptt || false },
                    documentMessage: { document: media, mimetype: mime, fileName: quoted.message[msgType]?.fileName || 'file' },
                    stickerMessage:  { sticker:  media },
                }
                await conn.sendMessage(targetJid, mediaSendMap[msgType] || { text: '[media]' })
            } else {
                const teksPesan =
                    quoted.text ||
                    quoted.body ||
                    quoted.message?.conversation ||
                    quoted.message?.extendedTextMessage?.text ||
                    ''
                if (teksPesan) {
                    await conn.sendMessage(targetJid, { text: teksPesan })
                } else {
                    await conn.copyNForward(targetJid, quoted)
                }
            }

            return conn.reply(m.chat,
`✅ *Pesan berhasil diteruskan!*

📤 Target  : \`${targetJid}\`
📨 Jenis   : ${msgType.replace('Message', '')}${adaTeks ? '\n📝 + Teks  : ' + pesanTeks : ''}`, m)

        } catch (e) {
            console.error('[PESANOTOMATIS] Forward error:', e)
            throw `❌ Gagal meneruskan pesan!\nError: ${e.message}`
        }
    }

    // ── Kirim: gambar + button + footer ────────────────────────────────────
    try {
        await sendBroadcastInteractive(conn, targetJid, pesanTeks)

        return conn.reply(m.chat,
`✅ *Pesan berhasil dikirim!*

📤 Target : \`${targetJid}\`
📝 Pesan  : ${pesanTeks.length > 80 ? pesanTeks.slice(0, 80) + '...' : pesanTeks}`, m)

    } catch (e) {
        console.error('[PESANOTOMATIS] Send error:', e)
        throw `❌ Gagal mengirim pesan!\nError: ${e.message}\n\nPastikan JID benar dan bot tidak diblokir.`
    }
}

// ── Metadata ───────────────────────────────────────────────────────────────
handler.help     = [
    'pesanotomatis <jid> <pesan>',
    'kirimke <jid> <pesan>',
    'broadcastowner <pesan>',
]
handler.tags     = ['owner']
handler.command  = /^(pesanotomatis|kirimke|broadcastowner)$/i

handler.rowner   = false
handler.owner    = true
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.fail     = null

module.exports = handler

// ── Auto-reload saat file berubah ──────────────────────────────────────────
const _file  = require.resolve(__filename)
const _fs    = require('fs')
const _chalk = (() => { try { return require('chalk') } catch { return { redBright: s => s } } })()
_fs.watchFile(_file, () => {
    _fs.unwatchFile(_file)
    console.log(_chalk.redBright(`Update 'pesanotomatis.js'`))
    delete require.cache[_file]
    if (global.reloadHandler) global.reloadHandler()
})
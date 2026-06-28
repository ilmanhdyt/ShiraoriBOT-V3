// plugins/waktuhabis.js
// Kirim pesan ke grup bahwa masa aktif bot habis, lalu keluar otomatis
// Cara: .waktuhabis [jidgrup]
// Contoh: .waktuhabis 1234567890-1234567890@g.us

'use strict'

const sleep = ms => new Promise(r => setTimeout(r, ms))

let handler = async (m, { conn, args, usedPrefix, command }) => {
    // Hanya owner yang bisa pakai
    const jidGrup = args[0]?.trim()

    if (!jidGrup) {
        return m.reply(
            `╭─「 ⏳ *WAKTU HABIS* 」\n` +
            `│\n` +
            `│  Cara pakai:\n` +
            `│  *${usedPrefix}${command} [jid grup]*\n` +
            `│\n` +
            `│  Contoh:\n` +
            `│  *${usedPrefix}${command} 1200000000-1609459200@g.us*\n` +
            `│\n` +
            `│  ⚠️ Bot akan:\n` +
            `│  1. Kirim pesan perpisahan ke grup\n` +
            `│  2. Kirim pesan ke kamu (owner)\n` +
            `│  3. Keluar dari grup otomatis\n` +
            `╰─────────────────────────────`.trim()
        )
    }

    // Validasi format JID grup
    if (!jidGrup.endsWith('@g.us')) {
        return m.reply(
            `❌ Format JID grup salah!\n\n` +
            `JID grup harus diakhiri dengan *@g.us*\n` +
            `Contoh: *1200000000-1609459200@g.us*\n\n` +
            `💡 Cara dapat JID grup:\n` +
            `Ketik *.listgrup* atau *.grupinfo* di grup target`
        )
    }

    // Cek apakah bot ada di grup tersebut
    let groupMeta
    try {
        groupMeta = await conn.groupMetadata(jidGrup)
    } catch (e) {
        return m.reply(
            `❌ Grup tidak ditemukan atau bot tidak ada di grup!\n\n` +
            `JID: \`${jidGrup}\`\n` +
            `Error: ${e.message}`
        )
    }

    const namaGrup = groupMeta?.subject || 'Grup'
    const botJid   = conn.user?.jid || conn.user?.id

    // Konfirmasi ke owner dulu
    await m.reply(
        `╭─「 ⏳ *KONFIRMASI* 」\n` +
        `│\n` +
        `│  Grup   : *${namaGrup}*\n` +
        `│  JID    : \`${jidGrup}\`\n` +
        `│\n` +
        `│  Bot akan kirim pesan perpisahan\n` +
        `│  dan keluar dari grup ini.\n` +
        `│\n` +
        `│  ⏳ Proses dimulai dalam 3 detik...\n` +
        `╰─────────────────────────────`.trim()
    )

    await sleep(3000)

    // ── Pesan ke grup target ───────────────────────────────────
    const pesanGrup =
        `╭─「 ⏳ *MASA AKTIF HABIS* 」\n` +
        `│\n` +
        `│  Assalamualaikum semuanya 🙏\n` +
        `│\n` +
        `│  Masa aktif *ShiraoriBOT* di grup ini\n` +
        `│  telah *habis* dan tidak diperpanjang.\n` +
        `│\n` +
        `│  Terima kasih telah menggunakan\n` +
        `│  layanan bot kami selama ini! 🤍\n` +
        `│\n` +
        `│  Bot akan keluar dari grup ini\n` +
        `│  dalam beberapa saat.\n` +
        `│\n` +
        `│  _Wassalamualaikum Wr. Wb._ 👋\n` +
        `╰─────────────────────────────`

    try {
        await conn.sendMessage(jidGrup, { text: pesanGrup })
    } catch (e) {
        return m.reply(`❌ Gagal kirim pesan ke grup!\nError: ${e.message}`)
    }

    // Jeda sebelum keluar agar pesan sempat terkirim
    await sleep(3000)

    // ── Keluar dari grup ───────────────────────────────────────
    try {
        await conn.groupLeave(jidGrup)
    } catch (e) {
        return m.reply(
            `⚠️ Pesan berhasil dikirim tapi gagal keluar dari grup!\n` +
            `Error: ${e.message}\n\n` +
            `Coba keluarkan bot secara manual dari grup.`
        )
    }

    // ── Laporan ke owner ───────────────────────────────────────
    await m.reply(
        `╭─「 ✅ *SELESAI* 」\n` +
        `│\n` +
        `│  ✅ Pesan perpisahan terkirim\n` +
        `│  ✅ Bot keluar dari grup\n` +
        `│\n` +
        `│  📋 *Detail:*\n` +
        `│  Grup  : *${namaGrup}*\n` +
        `│  JID   : \`${jidGrup}\`\n` +
        `│  Waktu : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
        `│\n` +
        `╰─────────────────────────────`.trim()
    )
}

handler.help     = ['waktuhabis [jidgrup]']
handler.tags     = ['owner']
handler.command  = /^(waktuhabis|masahabis|botkeluar)$/i

handler.rowner   = true
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = true
handler.admin    = false
handler.botAdmin = false
handler.fail     = null

module.exports = handler

// ── Auto-reload ────────────────────────────────────────────────
const _file  = require.resolve(__filename)
const _fs    = require('fs')
const _chalk = (() => { try { return require('chalk') } catch { return { redBright: s => s } } })()
_fs.watchFile(_file, () => {
    _fs.unwatchFile(_file)
    console.log(_chalk.redBright(`Update 'waktuhabis.js'`))
    delete require.cache[_file]
    if (global.reloadHandler) global.reloadHandler()
})
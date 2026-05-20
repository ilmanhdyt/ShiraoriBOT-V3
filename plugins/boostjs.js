// plugins/boost.js — Manual boost command (owner only)
// Disesuaikan untuk Pterodactyl panel (tanpa --expose-gc, tanpa PM2)
// Command: .boost

let handler = async (m, { conn, usedPrefix }) => {
    const toMB   = b => (b / 1024 / 1024).toFixed(1)
    const before = process.memoryUsage()
    const log    = []

    // ─── 1. Reset processedMsgs internal handler ─────────────────────
    try {
        // handler.js pakai module-level Set '_processedMessages'
        // boost.js tidak bisa akses langsung, tapi bisa lewat global kalau di-expose
        // Fallback: bersihkan _processedMsgs di global jika ada (dari plugin lain)
        let pmCount = 0
        if (global._processedMsgs instanceof Set) {
            pmCount = global._processedMsgs.size
            global._processedMsgs.clear()
        }
        if (global._processedMessages instanceof Set) {
            pmCount += global._processedMessages.size
            global._processedMessages.clear()
        }
        log.push(`✅ processedMsgs: ${pmCount} entri dibersihkan`)
    } catch (e) { log.push('❌ processedMsgs: ' + e.message) }

    // ─── 2. Reset msgqueque (queue pesan handler) ─────────────────────
    try {
        const c = global.conn
        if (Array.isArray(c?.msgqueque) && c.msgqueque.length > 0) {
            const len = c.msgqueque.length
            c.msgqueque = []
            log.push(`✅ msgqueque: ${len} item stuck dihapus`)
        } else {
            log.push('✅ msgqueque: bersih')
        }
    } catch (e) { log.push('❌ msgqueque: ' + e.message) }

    // ─── 3. Bersihkan conn.chats messages cache ───────────────────────
    try {
        let clearedChats = 0, totalMsgs = 0
        const chats = global.conn?.chats || {}
        for (const jid in chats) {
            const chat = chats[jid]
            if (!chat?.messages) continue
            const entries = Object.entries(chat.messages)
            totalMsgs += entries.length
            if (entries.length > 3) {
                chat.messages = Object.fromEntries(entries.slice(-3))
                clearedChats++
            }
        }
        log.push(`✅ Chat cache: ${totalMsgs} msg, ${clearedChats} chat ditrimming`)
    } catch (e) { log.push('❌ Chat cache: ' + e.message) }

    // ─── 4. Flush DB langsung (pakai writeNow jika ada) ───────────────
    try {
        if (typeof global.db?.writeNow === 'function') {
            await global.db.writeNow()
            log.push('✅ DB di-flush ke disk (writeNow)')
        } else if (typeof global.db?.write === 'function') {
            await global.db.write()
            log.push('✅ DB di-flush ke disk (write)')
        }
    } catch (e) { log.push('❌ DB flush: ' + e.message) }

    // ─── 5. Bersihkan folder tmp ──────────────────────────────────────
    try {
        const fs   = require('fs')
        const path = require('path')
        const tmpDir = path.join(__dirname, '../tmp')
        if (fs.existsSync(tmpDir)) {
            const files = fs.readdirSync(tmpDir).filter(f => f !== '.gitkeep')
            let deleted = 0
            for (const f of files) {
                try {
                    fs.rmSync(path.join(tmpDir, f), { recursive: true, force: true })
                    deleted++
                } catch (_) {}
            }
            log.push(`✅ Tmp: ${deleted}/${files.length} file dihapus`)
        } else {
            log.push('⚠️ Tmp: folder tidak ditemukan')
        }
    } catch (e) { log.push('❌ Tmp: ' + e.message) }

    // ─── 6. Bersihkan require.cache modul non-esensial ───────────────
    // Di Pterodactyl memory terbatas, cache modul yang sudah tidak dipakai perlu dilepas
    try {
        const path = require('path')
        const pluginDir = path.join(__dirname)  // /plugins
        let freed = 0
        for (const key of Object.keys(require.cache)) {
            // Lewati: node_modules, handler, main, config, lib, database
            if (
                key.includes('node_modules') ||
                key.includes('/handler') ||
                key.includes('/main') ||
                key.includes('/config') ||
                key.includes('/lib/') ||
                key.includes('/database/')
            ) continue
            // Hapus cache plugin yang TIDAK sedang aktif di global.plugins
            const filename = path.basename(key)
            if (key.includes(pluginDir) && !(filename in (global.plugins || {}))) {
                delete require.cache[key]
                freed++
            }
        }
        log.push(`✅ require.cache: ${freed} modul stale dibebaskan`)
    } catch (e) { log.push('❌ require.cache: ' + e.message) }

    // ─── 7. GC (Pterodactyl tidak expose --expose-gc secara default) ──
    // Pakai workaround: buat dan buang object besar untuk hint GC
    try {
        if (typeof global.gc === 'function') {
            global.gc()
            log.push('✅ Garbage Collection dijalankan (expose-gc aktif)')
        } else {
            // Workaround tanpa --expose-gc: hint GC dengan clear ref besar
            // Di Pterodactyl ini yang paling bisa dilakukan tanpa flag tambahan
            let hint = new Array(100000).fill(null)
            hint = null
            log.push('⚠️ GC: --expose-gc tidak aktif, pakai GC hint')
            log.push('   💡 Tambah di start script: node --expose-gc main.js')
        }
    } catch (e) { log.push('❌ GC: ' + e.message) }

    // ─── Kalkulasi ────────────────────────────────────────────────────
    // Tunggu sebentar sebelum baca after memory, biar hint GC sempat efek
    await new Promise(r => setTimeout(r, 300))
    const after = process.memoryUsage()

    const heapDiff   = before.heapUsed - after.heapUsed
    const savedMB    = (heapDiff / 1024 / 1024).toFixed(1)
    const savedLabel = heapDiff >= 0
        ? `📉 -${savedMB} MB`
        : `📈 +${Math.abs(savedMB)} MB`

    const uptime = process.uptime()
    const h   = Math.floor(uptime / 3600)
    const min = Math.floor((uptime % 3600) / 60)
    const s   = Math.floor(uptime % 60)

    // Info Pterodactyl spesifik
    const isExpose = typeof global.gc === 'function'
    const pteroHint = isExpose
        ? ''
        : '\n\n💡 *Tip Ptero:* Tambah `--expose-gc` di start command\npanel → Startup → Additional Node.js Flags: `--expose-gc`'

    return m.reply(
        `⚡ *BOOST SELESAI!*\n\n` +
        `${log.join('\n')}\n\n` +
        `╭─── 📊 *MEMORY*\n` +
        `│  Sebelum  : ${toMB(before.heapUsed)} MB\n` +
        `│  Sesudah  : ${toMB(after.heapUsed)} MB\n` +
        `│  Heap     : ${savedLabel}\n` +
        `│  RSS      : ${toMB(after.rss)} MB\n` +
        `│  External : ${toMB(after.external)} MB\n` +
        `╰─────────────────\n\n` +
        `╭─── ⏱️ *UPTIME*\n` +
        `│  ${h}j ${min}m ${s}d\n` +
        `╰─────────────────` +
        pteroHint
    )
}

handler.help     = ['boost']
handler.tags     = ['owner']
handler.command  = /^boost$/i
handler.owner    = true
handler.register = false

module.exports = handler
// plugins/cekjidgrup.js

// ── Utilitas JID ─────────────────────────────────────────────────────────────

/**
 * Bersihkan JID grup dari suffix yang tidak valid.
 *
 * Kasus bug yang pernah ditemukan di Baileys:
 *   1. '120363xxx@g.us:12345' → ada :timestamp setelah @g.us  → hapus bagian :xxxx
 *   2. '120363xxx@lid'        → LID mapping belum resolve      → skip (bukan @g.us)
 *   3. '120363xxx@newsletter' → WhatsApp Channel, bukan grup   → skip
 *   4. undefined / null       → edge case dari API             → skip
 *
 * @param {string} id - JID mentah dari groupFetchAllParticipating
 * @returns {string|null} JID bersih, atau null jika bukan grup valid
 */
function normalizeGroupJid(id) {
    if (!id || typeof id !== 'string') return null

    // Pisahkan local@server — ambil server tanpa suffix :device/:timestamp
    const atIdx   = id.indexOf('@')
    if (atIdx === -1) return null

    const local  = id.slice(0, atIdx)                    // bagian sebelum @
    const server = id.slice(atIdx + 1).split(':')[0]     // hapus :suffix setelah server

    // Hanya terima @g.us — tolak @lid, @newsletter, @broadcast, @s.whatsapp.net, dll
    if (server !== 'g.us') return null

    // Bersihkan local dari :device suffix juga (jaga-jaga)
    const cleanLocal = local.split(':')[0]
    if (!cleanLocal) return null

    return cleanLocal + '@g.us'
}

/**
 * Pastikan JID yang ditampilkan ke user sudah bersih & bisa langsung dipakai
 * sebagai target .pesanotomatis
 */
function safeGroupJid(g) {
    // g.id bisa rusak, coba juga g.subject sebagai fallback label saja
    return normalizeGroupJid(g?.id)
}

// ── Handler ──────────────────────────────────────────────────────────────────

let handler = async (m, { conn, isOwner }) => {
    // isOwner di sini diambil dari handler.js (sudah resolve LID/device-suffix
    // dengan benar), JANGAN hitung ulang manual pakai m.sender — itu yang bikin
    // owner asli kadang ke-detect bukan owner kalau sender-nya @lid / ada suffix.

    // ── DI DALAM GRUP: cukup tampilkan JID grup saat ini (semua orang boleh) ─
    if (m.isGroup) {
        const jidBersih = normalizeGroupJid(m.chat) || m.chat
        return conn.reply(m.chat, `🏘️ *JID Grup ini:*\n\`${jidBersih}\``, m)
    }

    // ── DI DM: kirim semua jid grup yang bot ikuti (khusus owner) ────────────
    if (!isOwner) {
        return conn.reply(m.chat, `❌ Command ini cuma bisa dipakai owner kalau lewat DM.\nKalau cuma mau cek JID grup, pakai command ini di dalam grup yang dimaksud.`, m)
    }
    try {
        const groups = await conn.groupFetchAllParticipating()
        const rawList = Object.values(groups || {})

        if (rawList.length === 0) return m.reply('❌ Bot tidak berada di grup manapun.')

        // FIX: Filter & normalisasi JID — buang yang bukan @g.us atau rusak
        const list     = []
        const dibuang  = []

        for (const g of rawList) {
            const jidFix = safeGroupJid(g)
            if (jidFix) {
                list.push({ ...g, id: jidFix })  // ganti id dengan yang sudah bersih
            } else {
                dibuang.push({ raw: g?.id, subject: g?.subject || 'Tanpa Nama' })
            }
        }

        // Urutkan A-Z berdasarkan nama grup
        list.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''))

        let teks =
            `🏘️ *DAFTAR GRUP BOT*\n` +
            `${'─'.repeat(25)}\n` +
            `📦 Total valid : *${list.length}* grup\n` +
            (dibuang.length > 0
                ? `⚠️ JID rusak   : *${dibuang.length}* grup (dilewati)\n`
                : '') +
            `${'─'.repeat(25)}\n\n`

        list.forEach((g, i) => {
            teks +=
                `*${i + 1}.* ${g.subject || 'Tanpa Nama'}\n` +
                `   📌 \`${g.id}\`\n` +
                `   👥 Member: ${g.participants?.length || 0}\n\n`
        })

        // Tambahkan daftar JID rusak di bagian bawah (info untuk owner)
        if (dibuang.length > 0) {
            teks += `${'─'.repeat(25)}\n`
            teks += `⚠️ *JID TIDAK VALID (dilewati):*\n`
            dibuang.forEach((g, i) => {
                teks += `${i + 1}. ${g.subject}\n   Raw: \`${g.raw || 'undefined'}\`\n`
            })
        }

        // Kalau terlalu panjang → kirim sebagai dokumen .txt
        if (teks.length > 4000) {
            const fs      = require('fs')
            const tmpPath = '/tmp/daftar-grup.txt'
            fs.writeFileSync(tmpPath, teks)
            await conn.sendMessage(m.chat, {
                document : fs.readFileSync(tmpPath),
                mimetype : 'text/plain',
                fileName : 'daftar-grup.txt',
                caption  :
                    `🏘️ *Daftar ${list.length} Grup Bot*\n` +
                    (dibuang.length > 0 ? `⚠️ ${dibuang.length} JID rusak dilewati\n` : '') +
                    `_Terlalu panjang, dikirim sebagai file_`
            }, { quoted: m })
            fs.unlinkSync(tmpPath)
        } else {
            await m.reply(teks.trim())
        }

    } catch (e) {
        console.log('[cekjidgrup] error:', e.message)
        m.reply(`❌ Gagal ambil daftar grup!\nError: ${e.message}`)
    }
}

handler.help    = ['jidgrup']
handler.tags    = ['grup']
handler.command = ['jidgrup']
handler.group   = false
module.exports  = handler
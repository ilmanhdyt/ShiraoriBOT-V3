// plugins/_lidcheck.js
// Saat ada @lid yang di-tag dan belum ada di lidMap:
// - Kalau user ketemu di DB → AUTO setlid langsung (tanpa manual)
// - Kalau tidak ketemu → kirim notif biasa ke log

let handler = m => m

const { jidToNum, numToJid, getDbUser, displayForJid } = require('../lib/jidUtils')

function getLidMentions(mentionedJid = []) {
    return mentionedJid.filter(jid => typeof jid === 'string' && jid.endsWith('@lid'))
}

handler.before = async function (m, { conn }) {
    if (!m || !m.mentionedJid?.length) return true
    if (m.isBaileys) return true
    const lidMentions = getLidMentions(m.mentionedJid)
    if (!lidMentions.length) return true

    const lidMap  = global.db.data?.settings?.lidMap || {}
    const users   = global.db.data?.users || {}

    const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
    const ownerJid  = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
    const LOG_GROUP = '120363426689989491@g.us'

    // Pastikan settings & lidMap tersedia
    if (!global.db.data.settings) global.db.data.settings = {}
    if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
    const lm = global.db.data.settings.lidMap

    for (const tagged of lidMentions) {
        // Hanya proses @lid yang belum ada mapping valid
        const mapped = lm[tagged]
        const mappedNum = mapped ? jidToNum(mapped) : ''
        if (mappedNum && getDbUser(mappedNum)) continue

        const lidNum = tagged.split('@')[0]

        // ── Cari user di DB berdasar angka LID == angka nomor WA ──────
        let foundJid  = null
        let foundUser = null

        // Cara 1: angka LID cocok dengan angka nomor WA di DB
        for (const [key, data] of Object.entries(users)) {
            if (!(!key.endsWith('@g.us') && key.length > 5)) continue
            if (key.split('@')[0].split(':')[0] === lidNum) {
                foundJid  = key
                foundUser = data
                break
            }
        }

        // Cara 2: cek lidMap reverse (sudah ada mapping tapi belum ke @s.whatsapp.net)
        if (!foundJid) {
            for (const [k, v] of Object.entries(lm)) {
                if (k === tagged) {
                    const normalized = jidToNum(v)
                    if (normalized && users[normalized]) {
                        foundJid  = normalized
                        foundUser = users[normalized]
                        break
                    }
                }
            }
        }

        // Cara 3: scan semua user, cari yang punya field lid cocok
        if (!foundJid) {
            for (const [key, data] of Object.entries(users)) {
                if (!(!key.endsWith('@g.us') && key.length > 5)) continue
                if (data?.lid === tagged || data?.lidJid === tagged) {
                    foundJid  = key
                    foundUser = data
                    break
                }
            }
        }

        // ── AUTO SETLID: kalau user ditemukan di DB ────────────────────
        if (foundJid && foundUser) {
            // Simpan mapping langsung
            lm[tagged] = jidToNum(foundJid)
            await global.db.write().catch(() => {})

            const nama    = foundUser.name || lidNum
            const waNum   = foundJid.split('@')[0].split(':')[0]
            const mentions = [numToJid(jidToNum(foundJid)), ...(ownerJid ? [ownerJid] : [])]
            const ownerTag = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
            const isReg    = foundUser.registered ? '✅ Terdaftar' : '⚠️ Belum daftar'

            console.log(`[LIDCheck] ✅ Auto-setlid: ${jidToNum(foundJid)} (${nama})`)

            await conn.sendMessage(LOG_GROUP, {
                text:
                    `✅ *LID Auto-Resolved!*\n\n` +
                    `👤 *Nama:* ${nama}\n` +
                    `📱 *Nomor WA:* \`${waNum}\`\n` +
                    `📋 *Status:* ${isReg}\n\n` +
                    `✔️ Mapping otomatis disimpan, tidak perlu .setlid manual.\n\n` +
                    `${ownerTag}`,
                mentions
            }).catch(() => {})

            continue // sudah beres, lanjut ke @lid berikutnya
        }

        // ── Tidak ketemu di DB → kirim notif manual seperti biasa ─────
        const ownerTag = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
        const mentions = [...(ownerJid ? [ownerJid] : [])]

        // Coba cari dari groupMetadata participants untuk dapat nomor WA-nya
        let hintNum = null
        if (m.isGroup) {
            try {
                const meta = await conn.groupMetadata(m.chat)
                for (const p of (meta.participants || [])) {
                    const pId  = conn.decodeJid(p.id || '')
                    const pLid = p.lid || p.lidJid || ''
                    const pLidNum = pLid.replace(/[^0-9]/g, '')
                    if (pLidNum === lidNum && pId.endsWith('@s.whatsapp.net')) {
                        hintNum = pId.split('@')[0].split(':')[0]
                        // Langsung auto-setlid juga kalau dapat dari metadata grup!
                        lm[tagged] = jidToNum(pId)
                        await global.db.write().catch(() => {})
                        console.log(`[LIDCheck] ✅ Auto-setlid via groupMeta: ${pId}`)
                        break
                    }
                }
            } catch (_) {}
        }

        if (hintNum && lm[tagged]) {
            // Berhasil resolve dari group metadata
            const mentions2 = [numToJid(lm[tagged]), ...(ownerJid ? [ownerJid] : [])]
            await conn.sendMessage(LOG_GROUP, {
                text:
                    `✅ *LID Resolved dari Grup!*\n\n` +
                    `📱 *Nomor WA:* \`${hintNum}\`\n\n` +
                    `⚠️ User belum terdaftar di DB bot.\n` +
                    `✔️ Mapping disimpan otomatis.\n\n` +
                    `${ownerTag}`,
                mentions: mentions2
            }).catch(() => {})
        } else {
            // Benar-benar tidak ditemukan → notif manual
            await conn.sendMessage(LOG_GROUP, {
                text:
                    `🔔 *LID Tidak Dikenal Terdeteksi!*\n\n` +
                    `👤 *Nama (dari WA):* _(tidak diketahui)_\n\n` +
                    `⚠️ User ini belum ada di DB.\n` +
                    `Jika kamu tahu nomor WA-nya, ketik:\n` +
                    `.setlid <nomor> ${lidNum}\n\n` +
                    `${ownerTag}`,
                mentions
            }).catch(() => {})
        }
    }

    return true
}

handler.command  = false
handler.disabled = false

module.exports = handler

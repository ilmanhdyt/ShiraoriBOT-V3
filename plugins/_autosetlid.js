// plugins/_autosetlid.js
// ═══════════════════════════════════════════════════════════════════════════
//  AUTO SETLID v3 — Fix: p.lid decoding, LID/WA number confusion, syntax
// ═══════════════════════════════════════════════════════════════════════════
//
//  v2 bugs yang diperbaiki:
//  1. p.lid bisa "198771824672843:0@lid" (ada device suffix) — harus decode
//     dulu via conn.decodeJid() sebelum compare, PERSIS seperti resolveLid
//     di simple.js. Tanpa ini, string compare SELALU gagal.
//  2. looksLikeWaNumber(/^\d{5,20}$/) menerima angka LID 15 digit —
//     menyebabkan false positive, LID disangka nomor WA valid.
//  3. Template literal syntax error: pakai kutip biasa bukan backtick.
//  4. p.id kadang juga @lid — harus fallback ke p.senderPn/p.phoneNumber.
//
// ═══════════════════════════════════════════════════════════════════════════

'use strict'

const { numToJid, getDbUser } = require('../lib/jidUtils')

// ── Konstanta ──────────────────────────────────────────────────────────────
const LOG_GROUP           = '120363426689989491@g.us'
const COOLDOWN_BULK_MS    = 5 * 60 * 1000  // cooldown untuk bulk scan rutin
const COOLDOWN_URGENT_MS  = 30 * 1000      // cooldown min untuk urgent (LID aktif)
const RETRY_DELAY_MS      = 2000            // delay retry setelah groupMeta gagal

// ── State modul ───────────────────────────────────────────────────────────
if (!global._autosetlidNotified)  global._autosetlidNotified  = new Set()
if (!global._autosetlidPending)   global._autosetlidPending   = new Set()
if (!global._autosetlidGroupMeta) global._autosetlidGroupMeta = new Map()
if (!global._autosetlidFailed)    global._autosetlidFailed    = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Cek apakah string adalah nomor WA asli (BUKAN angka LID).
 * Nomor WA: 8-13 digit (62xxx, 1xxx, 44xxx, dst).
 * Angka LID: biasanya 15 digit, pattern berbeda.
 * Kita pakai 8-14 digit untuk safety margin.
 */
function isRealWaNumber(num) {
    return typeof num === 'string' && /^\d{8,14}$/.test(num)
}

function ensureLidMap() {
    if (!global.db?.data?.settings) global.db.data.settings = {}
    if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
    return global.db.data.settings.lidMap
}

/** Return true jika mapping BARU atau berubah */
function saveLid(lid, waNum) {
    try {
        if (!isRealWaNumber(waNum)) return false
        const lm = ensureLidMap()
        const old = lm[lid]
        lm[lid] = waNum
        if (!old || old !== waNum) {
            global.db.write().catch(() => {})
            return true
        }
        return false
    } catch (_) { return false }
}

/**
 * Cari nomor WA dari array participants groupMetadata.
 * PENTING: Pakai conn.decodeJid() untuk p.lid karena bisa punya device suffix
 * seperti "198771824672843:0@lid" yang harus di-decode jadi "198771824672843@lid".
 */
function resolveFromParticipants(conn, lidNum, parts = []) {
    for (const p of parts) {
        // ── Match p.lid ke lidNum ──
        let pLidNum = null
        if (typeof p.lid === 'string' && p.lid) {
            // KRITIS: decodeJid menghapus device suffix ":0" dari "xxx:0@lid"
            const decoded = conn.decodeJid(p.lid)
            pLidNum = decoded.includes('@') ? decoded.split('@')[0] : decoded
        } else if (p.lid && typeof p.lid === 'object') {
            pLidNum = String(p.lid.user || '')
        }
        if (!pLidNum || pLidNum !== lidNum) continue

        // ── Ambil nomor WA dari p.id ──
        const rawId = conn.decodeJid(
            (typeof p.id === 'string' && p.id) ||
            (typeof p.jid === 'string' && p.jid) || ''
        )
        if (rawId && rawId.endsWith('@s.whatsapp.net')) {
            const n = rawId.split('@')[0].split(':')[0]
            if (isRealWaNumber(n)) return n
        }

        // ── p.id juga @lid → fallback ke senderPn / phoneNumber ──
        const pn = p.senderPn || p.phoneNumber || p.pn
        if (pn) {
            const s = String(pn).replace(/[^0-9]/g, '')
            if (isRealWaNumber(s)) return s
        }
    }
    return null
}

/** Kirim DM ke user (hanya sekali, hanya jika belum daftar) */
async function sendDmNotif(conn, waNum, lidNum, prefix = '.') {
    try {
        const dmKey = 'dm:' + lidNum
        if (global._autosetlidNotified.has(dmKey)) return
        const user = getDbUser(numToJid(waNum))
        if (user?.registered) return
        global._autosetlidNotified.add(dmKey)

        await conn.sendMessage(numToJid(waNum), {
            text:
                `👋 *Halo!*\n\n` +
                `Bot berhasil mendeteksi nomor WA kamu secara otomatis! 🎉\n\n` +
                `Sebelumnya kamu tidak bisa menggunakan bot karena nomor WA kamu ` +
                `disembunyikan oleh fitur privasi WhatsApp Community Group.\n\n` +
                `Kabar baik: Sekarang kamu sudah bisa mendaftar dan ` +
                `menggunakan semua fitur bot!\n\n` +
                `📋 *Cara daftar:*\n` +
                `Ketik perintah ini di grup atau langsung di sini:\n` +
                `*${prefix}daftar <nama>.<umur>*\n\n` +
                `Contoh: *${prefix}daftar BotUser.20*\n\n` +
                `Selamat bergabung! 🎮`
        }).catch(() => {})

        console.log(`[AutoSetLID] 📩 DM → ${waNum} (LID: ${lidNum})`)
    } catch (_) {}
}

/** Kirim notif ke LOG_GROUP */
async function sendLogNotif(conn, waNum, lidNum, user) {
    try {
        const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
        const ownerJid  = ownerNums.length ? numToJid(ownerNums[0]) : null
        const ownerTag  = ownerJid ? `@${ownerNums[0]}` : 'owner'
        const userJid   = numToJid(waNum)
        const status    = user?.registered
            ? `✅ Terdaftar (*${user.name}*, Lv.${user.level || 1})`
            : '⚠️ Belum daftar — DM sudah dikirim'

        await conn.sendMessage(LOG_GROUP, {
            text:
                `🔗 *AutoSetLID Berhasil!*\n\n` +
                `📱 *Nomor WA* : \`${waNum}\`\n` +
                `🔑 *LID*      : \`${lidNum}\`\n` +
                `👤 *Status DB*: ${status}\n\n` +
                `✔️ Mapping disimpan otomatis ke lidMap.\n` +
                `User sudah bisa pakai bot normal.\n\n` +
                `${ownerTag}`,
            mentions: [userJid, ...(ownerJid ? [ownerJid] : [])]
        }).catch(() => {})
    } catch (_) {}
}

/**
 * Setelah resolve berhasil: simpan, notif log, DM user.
 * Return true jika mapping baru.
 */
async function onResolved(conn, lid, waNum, prefix = '.') {
    if (!isRealWaNumber(waNum)) return false
    const isNew = saveLid(lid, waNum)
    const lidNum = lid.split('@')[0]
    console.log(`[AutoSetLID] ✅ ${isNew ? 'BARU' : 'UPDATE'}: ${lidNum} → ${waNum}`)

    // Bersihkan dari failed-map kalau sebelumnya gagal
    global._autosetlidFailed.delete(lid)

    if (isNew) {
        const logKey = 'log:' + lidNum
        if (!global._autosetlidNotified.has(logKey)) {
            global._autosetlidNotified.add(logKey)
            const user = getDbUser(numToJid(waNum))
            await sendLogNotif(conn, waNum, lidNum, user)
            await sendDmNotif(conn, waNum, lidNum, prefix)
        }
    }
    return isNew
}

/**
 * Coba resolve dari sumber-sumber CEPAT (tanpa API call):
 * senderPn, lidMap, conn.contacts, conn.resolveLid, chats cache.
 * Return nomor WA atau null.
 */
function resolveFast(conn, lid, msgKey, chatJid) {
    const lidNum = lid.split('@')[0]

    // ── Sumber 0: m.key.senderPn (paling reliable, langsung dari WA) ────
    try {
        const pn = msgKey?.senderPn || msgKey?.sn || msgKey?.pn
        if (pn) {
            const n = String(pn).replace(/[^0-9]/g, '')
            if (isRealWaNumber(n)) return n
        }
    } catch (_) {}

    // ── Sumber 1: lidMap cache ────────────────────────────────────────────
    try {
        const lm = global.db?.data?.settings?.lidMap
        if (lm?.[lid] && isRealWaNumber(lm[lid])) return lm[lid]
    } catch (_) {}

    // ── Sumber 2: conn.contacts[lid] ─────────────────────────────────────
    try {
        const c = conn.contacts?.[lid]
        if (c?.id?.endsWith('@s.whatsapp.net')) {
            const n = c.id.split('@')[0].split(':')[0]
            if (isRealWaNumber(n)) return n
        }
    } catch (_) {}

    // ── Sumber 3: conn.contacts reverse scan ─────────────────────────────
    try {
        if (conn.contacts) {
            for (const [cKey, cVal] of Object.entries(conn.contacts)) {
                if (!cKey.endsWith('@s.whatsapp.net')) continue
                const cLid = cVal?.lid || cVal?.lidJid || ''
                if (!cLid) continue
                // KRITIS: decodeJid untuk handle device suffix
                const cLidDecoded = conn.decodeJid(typeof cLid === 'string' ? cLid : '')
                const cLidNum = cLidDecoded.includes('@') ? cLidDecoded.split('@')[0] : cLidDecoded
                if (cLidNum !== lidNum) continue
                const n = cKey.split('@')[0].split(':')[0]
                if (isRealWaNumber(n)) return n
            }
        }
    } catch (_) {}

    // ── Sumber 4: conn.resolveLid() ──────────────────────────────────────
    try {
        const r = conn.resolveLid?.(lid, chatJid)
        if (r && r !== lid && !r.endsWith('@lid')) {
            const n = r.endsWith('@s.whatsapp.net') ? r.split('@')[0].split(':')[0] : r
            if (isRealWaNumber(n)) return n
        }
    } catch (_) {}

    // ── Sumber 5: conn.chats cached metadata ─────────────────────────────
    try {
        if (chatJid) {
            const cached = conn.chats?.[chatJid]?.metadata?.participants
            if (cached?.length) {
                const found = resolveFromParticipants(conn, lidNum, cached)
                if (found && isRealWaNumber(found)) return found
            }
        }
    } catch (_) {}

    // ── Sumber DM: bukan grup, chat = lawan bicara ───────────────────────
    try {
        if (chatJid?.endsWith('@s.whatsapp.net')) {
            const n = chatJid.split('@')[0].split(':')[0]
            if (isRealWaNumber(n)) return n
        }
    } catch (_) {}

    return null
}

/**
 * Resolve via groupMetadata API (async, bisa bypass cooldown).
 * urgent=true → bypass cooldown, selalu fetch sekarang.
 */
async function resolveViaGroupMeta(conn, lid, chatJid, prefix, urgent = false) {
    const lidNum = lid.split('@')[0]
    const now    = Date.now()
    const last   = global._autosetlidGroupMeta.get(chatJid) || 0
    const threshold = urgent ? COOLDOWN_URGENT_MS : COOLDOWN_BULK_MS

    if (!urgent && (now - last) < threshold) return null

    try {
        global._autosetlidGroupMeta.set(chatJid, now)
        const meta = await conn.groupMetadata(chatJid)
        if (!meta?.participants?.length) {
            console.log(`[AutoSetLID] ⚠️ groupMetadata kosong untuk ${chatJid}`)
            return null
        }

        // Debug: log jumlah participants dan berapa yang punya lid
        if (urgent) {
            const withLid = meta.participants.filter(p => p.lid).length
            console.log(`[AutoSetLID] 🔍 groupMeta ${chatJid}: ${meta.participants.length} participants, ${withLid} punya lid`)
        }

        // Bulk-save semua sekalian
        bulkSaveFromParticipants(conn, meta.participants, prefix)

        // Cari yang kita butuhkan — pakai conn untuk decodeJid
        const found = resolveFromParticipants(conn, lidNum, meta.participants)
        
        if (!found && urgent) {
            // Debug: dump semua lid dari participants untuk diagnosis
            const allLids = meta.participants
                .filter(p => p.lid)
                .map(p => {
                    const decoded = conn.decodeJid(typeof p.lid === 'string' ? p.lid : `${p.lid?.user}@${p.lid?.server || 'lid'}`)
                    const pId = conn.decodeJid(p.id || p.jid || '')
                    return `${decoded.split('@')[0]} → ${pId.split('@')[0]}`
                })
                .slice(0, 5)
            console.log(`[AutoSetLID] 🔍 LID ${lidNum} tidak ditemukan. Sample participants: ${allLids.join(', ')}`)
        }

        return (found && isRealWaNumber(found)) ? found : null
    } catch (e) {
        console.log(`[AutoSetLID] ⚠️ groupMetadata error: ${e?.message || e}`)
        return null
    }
}

/**
 * Master resolve untuk satu LID.
 * urgent=true: bypass cooldown groupMetadata, dipakai saat sender adalah LID.
 */
async function tryResolveLid(conn, lid, msgKey, chatJid, isGroup, prefix, urgent = false) {
    if (global._autosetlidPending.has(lid)) return

    // Throttle retry untuk LID yang sebelumnya gagal (cegah spam API)
    if (!urgent) {
        const lastFail = global._autosetlidFailed.get(lid) || 0
        if (Date.now() - lastFail < COOLDOWN_BULK_MS) return
    }

    global._autosetlidPending.add(lid)
    try {
        const lm  = ensureLidMap()
        const lidNum = lid.split('@')[0]

        // Cek mapping valid yang sudah ada
        if (lm[lid] && isRealWaNumber(lm[lid])) {
            // Sudah punya mapping — pastikan DM terkirim
            const dmKey = 'dm:' + lidNum
            if (!global._autosetlidNotified.has(dmKey)) {
                await sendDmNotif(conn, lm[lid], lidNum, prefix)
            }
            return
        }

        // ── Step 1: Coba sumber cepat dulu ───────────────────────────────
        let waNum = resolveFast(conn, lid, msgKey, chatJid)

        // ── Step 2: groupMetadata jika belum berhasil dan ada grup ───────
        if (!waNum && isGroup && chatJid) {
            waNum = await resolveViaGroupMeta(conn, lid, chatJid, prefix, urgent)
        }

        if (!waNum) {
            console.log(`[AutoSetLID] ⚠️ Gagal resolve LID: ${lidNum}${urgent ? ' (urgent)' : ''}`)
            // Kalau urgent masih gagal, jadwalkan retry sekali lagi setelah delay
            if (urgent) {
                setTimeout(async () => {
                    // Retry sekali dengan live fetch paksa
                    if (global._autosetlidPending.has(lid)) return
                    global._autosetlidPending.add(lid)
                    try {
                        const lm2 = ensureLidMap()
                        if (lm2[lid] && isRealWaNumber(lm2[lid])) return
                        const waNum2 = await resolveViaGroupMeta(conn, lid, chatJid, prefix, true)
                        if (waNum2) await onResolved(conn, lid, waNum2, prefix)
                        else global._autosetlidFailed.set(lid, Date.now())
                    } catch (_) {}
                    finally { global._autosetlidPending.delete(lid) }
                }, RETRY_DELAY_MS)
            } else {
                global._autosetlidFailed.set(lid, Date.now())
            }
            return
        }

        await onResolved(conn, lid, waNum, prefix)

    } catch (err) {
        console.log(`[AutoSetLID] error: ${err?.message || err}`)
        global._autosetlidFailed.set(lid, Date.now())
    } finally {
        global._autosetlidPending.delete(lid)
    }
}

/**
 * Bulk-save semua LID dari participants (dengan notif per mapping baru).
 */
function bulkSaveFromParticipants(conn, participants = [], prefix = '.') {
    try {
        const lm = ensureLidMap()
        let changed = false

        for (const p of participants) {
            // ── Ambil lid ──
            let pLid = null
            if (typeof p.lid === 'string' && p.lid) {
                // KRITIS: decodeJid untuk handle "xxx:0@lid"
                pLid = conn.decodeJid(p.lid)
                if (!pLid.endsWith('@lid')) pLid = pLid + '@lid'
            } else if (p.lid && typeof p.lid === 'object' && p.lid.user) {
                pLid = `${p.lid.user}@${p.lid.server || 'lid'}`
            }
            if (!pLid || !pLid.endsWith('@lid')) continue

            // ── Ambil nomor WA ──
            const rawId = conn.decodeJid(
                (typeof p.id === 'string' && p.id) ||
                (typeof p.jid === 'string' && p.jid) || ''
            )
            let waNum = null
            if (rawId && rawId.endsWith('@s.whatsapp.net')) {
                const n = rawId.split('@')[0].split(':')[0]
                if (isRealWaNumber(n)) waNum = n
            }
            // Fallback ke senderPn jika p.id juga @lid
            if (!waNum) {
                const pn = p.senderPn || p.phoneNumber || p.pn
                if (pn) {
                    const s = String(pn).replace(/[^0-9]/g, '')
                    if (isRealWaNumber(s)) waNum = s
                }
            }
            if (!waNum) continue

            // Skip jika LID num sama dengan WA num (false positive)
            if (pLid.split('@')[0] === waNum) continue

            const isNew = !lm[pLid] || lm[pLid] !== waNum
            if (!isNew) continue

            lm[pLid] = waNum
            changed = true
            console.log(`[AutoSetLID] 📦 Bulk: ${pLid} → ${waNum}`)

            const lidNum = pLid.split('@')[0]
            const logKey = 'log:' + lidNum
            if (!global._autosetlidNotified.has(logKey)) {
                global._autosetlidNotified.add(logKey)
                const user = getDbUser(numToJid(waNum))
                sendLogNotif(conn, waNum, lidNum, user).catch(() => {})
                sendDmNotif(conn, waNum, lidNum, prefix).catch(() => {})
            }
        }

        if (changed) global.db.write().catch(() => {})
    } catch (_) {}
}

// ── Conn yang sekarang juga perlu saveLidMapping ──
// Pastikan saveLidMapping juga pakai decodeJid
function ensureSaveLidMapping(conn) {
    if (!conn._autosetlidPatched && typeof conn.saveLidMapping === 'function') {
        // Sudah ada dari simple.js, tidak perlu patch
        conn._autosetlidPatched = true
    }
}

// ── Handler ────────────────────────────────────────────────────────────────

let handler = m => m

handler.before = async function (m, { conn, usedPrefix }) {
    if (!m || m.isBaileys) return true

    ensureSaveLidMapping(conn)

    const chat    = m.chat || ''
    const isGroup = chat.endsWith('@g.us')
    const prefix  = usedPrefix || (global.prefix?.[0]) || '.'
    const msgKey  = m.key || {}

    // ── A. LID sender (URGENT — resolve sekarang, bukan background) ───────
    try {
        const sender     = m.sender || ''
        const isLidJid   = sender.endsWith('@lid')
        // Plain LID: 15+ digit, BUKAN nomor WA (nomor WA max ~14 digit)
        const isPlainLid = !sender.includes('@') && /^\d{15,}$/.test(sender)

        if (isLidJid || isPlainLid) {
            const lidNum = isLidJid ? sender.split('@')[0] : sender
            const lid    = lidNum + '@lid'

            // Coba sumber cepat SYNC dulu — kalau berhasil, langsung update m.sender
            const fast = resolveFast(conn, lid, msgKey, chat)
            if (fast) {
                await onResolved(conn, lid, fast, prefix)
                m.sender = fast
            } else if (isGroup) {
                // Sumber cepat gagal → fetch groupMetadata sekarang (urgent, bypass cooldown)
                const found = await resolveViaGroupMeta(conn, lid, chat, prefix, true)
                if (found) {
                    await onResolved(conn, lid, found, prefix)
                    m.sender = found
                } else {
                    // Jadwalkan retry di background untuk pesan selanjutnya
                    setTimeout(async () => {
                        await tryResolveLid(conn, lid, msgKey, chat, isGroup, prefix, true).catch(() => {})
                    }, RETRY_DELAY_MS)
                }
            }
        }
    } catch (_) {}

    // ── B. LID mention (background — tidak blocking) ──────────────────────
    try {
        const mentions    = m.mentionedJid || []
        const lidMentions = mentions.filter(j => typeof j === 'string' && j.endsWith('@lid'))
        for (const lid of lidMentions) {
            setImmediate(() => tryResolveLid(conn, lid, msgKey, chat, isGroup, prefix, false).catch(() => {}))
        }
    } catch (_) {}

    // ── C. Bulk-scan rutin per grup (background, kena cooldown 5 menit) ───
    try {
        if (isGroup) {
            const now  = Date.now()
            const last = global._autosetlidGroupMeta.get(chat) || 0
            if (now - last > COOLDOWN_BULK_MS) {
                global._autosetlidGroupMeta.set(chat, now)
                setImmediate(async () => {
                    try {
                        const meta = await conn.groupMetadata(chat)
                        if (meta?.participants?.length) {
                            bulkSaveFromParticipants(conn, meta.participants, prefix)
                            // Juga panggil saveLidMapping bawaan simple.js
                            if (typeof conn.saveLidMapping === 'function') {
                                conn.saveLidMapping(meta.participants)
                            }
                        }
                    } catch (_) {}
                })
            }
        }
    } catch (_) {}

    return true
}

handler.command  = false
handler.disabled = false

module.exports = handler
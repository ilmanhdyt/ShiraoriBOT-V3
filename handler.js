const simple = require('./lib/simple')
const util = require('util')
const { jidToNum, numToJid, normalizeMentions, ensureDbUser, getDbUser, displayForJid, resolveUserIdentity, getUserKey } = require('./lib/jidUtils')

// ── MIGRATED: shiraori-baileys utilities ────────────────────────────
const {
    extractPhoneNumber: _shiraExtractPhone,
    extractPhoneNumberFromKey: _shiraExtractKey,
    isLidJid: _shiraIsLid,
    isUserJid: _shiraIsUser,
} = require('shiraori-baileys')

// Cache dompet module di top-level agar tidak require() setiap pesan
let _dompetModule = null
try { _dompetModule = require('./plugins/dompet') } catch (_) {}

const isNumber = x => typeof x === 'number' && !isNaN(x)
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(resolve, ms))


const _processedMessages = new Set()
const _MAX_PROCESSED_CACHE = 500
const _groupMetaRefresh = new Map()
const _USER_INDEX_TTL_MS = 60 * 1000
const _LIDMAP_CLEANUP_INTERVAL_MS = 10 * 60 * 1000
const DEBUG_MENTION_RESOLUTION = process.env.DEBUG_MENTION_RESOLUTION === 'true'
let _cachedUserIndex = null
let _cachedUserIndexAt = 0
let _cachedUserCount = -1
let _cachedCtx = null  // Context object untuk plugin, cached sekali
let _cachedOwnerNums = null
let _cachedOwnerFormatted = null
let _cachedOwnerRaw = null  // track when global.owner changes
let _cachedModsRaw = null
let _cachedModsNums = null
let _cachedPremsRaw = null
let _cachedPremsNums = null
let _cachedPrefixRaw = null
let _cachedPrefixMatchers = null

// FIX: expose cache invalidation so jidUtils.invalidateUserIndex() can clear this module's cache
// Called via global._invalidateUserIndex() from plugins after register/unregister/rename
if (!global._userIndexCache) global._userIndexCache = {}
global._userIndexCache._setter = (idx, at, count) => {
    _cachedUserIndex = idx
    _cachedUserIndexAt = at
    _cachedUserCount = count
}
let _lastLidMapCleanupAt = 0

function getUsersMap() {
    return global.db?.data?.users || {}
}

function buildUserIndex(users) {
    const byNumber = new Map()
    const byRegisteredName = new Map()

    for (const [key, data] of Object.entries(users)) {
        if (!(!key.endsWith('@g.us') && key.length > 5)) continue

        const number = key.split('@')[0].split(':')[0]
        if (number && !byNumber.has(number)) byNumber.set(number, key)

        if (data?.registered) {
            const name = String(data.name || '').trim().toLowerCase()
            if (name && !byRegisteredName.has(name)) byRegisteredName.set(name, key)
        }
    }

    return { byNumber, byRegisteredName }
}

function getUserIndex() {
    const users = getUsersMap()
    const now = Date.now()
    const userCount = Object.keys(users).length

    if (!_cachedUserIndex || now - _cachedUserIndexAt > _USER_INDEX_TTL_MS || userCount !== _cachedUserCount) {
        _cachedUserIndex = buildUserIndex(users)
        _cachedUserIndexAt = now
        _cachedUserCount = userCount
        // Sync values back to global setter so invalidateUserIndex() can clear them
        if (global._userIndexCache?._setter) {
            // Store current references — setter clears them on invalidate
            global._userIndexCache._getRef = () => _cachedUserIndex
        }
    }

    return _cachedUserIndex
}

function maybeCleanupInvalidLidMap() {
    const now = Date.now()
    if (now - _lastLidMapCleanupAt < _LIDMAP_CLEANUP_INTERVAL_MS) return
    _lastLidMapCleanupAt = now

    try {
        const lm = global.db.data?.settings?.lidMap
        if (!lm) return

        let changed = false
        for (const [k, v] of Object.entries(lm)) {
            if (!k.endsWith('@lid') || !v || v.includes('@') || v.length < 6) {
                delete lm[k]
                changed = true
            }
        }
        if (changed) global.db.write().catch(() => {})
    } catch (_) {}
}

function logMentionResolution(stage, payload) {
    if (!DEBUG_MENTION_RESOLUTION) return
    try {
        console.log('[MENTION]', stage, JSON.stringify(payload))
    } catch (_) {}
}

function fixBrokenEmojiText(text) {
    return String(text || '')
        .replaceAll('ðŸ””', '\uD83D\uDD14')
        .replaceAll('ðŸ”‘', '\uD83D\uDD11')
        .replaceAll('ðŸ“Œ', '\uD83D\uDCCC')
        .replaceAll('ðŸ‘¤', '\uD83D\uDC64')
        .replaceAll('ðŸ“²', '\uD83D\uDCF2')
        .replaceAll('ðŸ“±', '\uD83D\uDCF1')
        .replaceAll('âš ï¸', '\u26A0\uFE0F')
        .replaceAll('âŒ', '\u274C')
        .replaceAll('â³', '\u23F3')
        .replaceAll('âœ…', '\u2705')
}

function escapeRegex(str = '') {
    return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
}

function getPrefixMatchers(prefix) {
    if (prefix instanceof RegExp) return [prefix]
    if (Array.isArray(prefix)) {
        return prefix.map(item => item instanceof RegExp ? item : new RegExp(escapeRegex(String(item))))
    }
    if (typeof prefix === 'string') return [new RegExp(escapeRegex(prefix))]
    return [new RegExp]
}

function resolvePluginMatch(entry, text, defaultMatchers) {
    if (!entry?.plugin) return [[], new RegExp]
    if (entry.hasCustomPrefix) {
        if (!entry._customPrefixMatchers) {
            entry._customPrefixMatchers = getPrefixMatchers(entry.plugin.customPrefix)
        }
        for (const matcher of entry._customPrefixMatchers) {
            const result = matcher.exec(text)
            if (result) return [result, matcher]
        }
        return [[], entry._customPrefixMatchers[0] || new RegExp]
    }

    for (const matcher of defaultMatchers) {
        const result = matcher.exec(text)
        if (result) return [result, matcher]
    }
    return [[], defaultMatchers[0] || new RegExp]
}

function pickCommandEntries(registry, command) {
    if (!registry) return []
    if (!command) return registry.nonExactCommandEntries || []

    const exactEntries = registry.exactCommandMap?.get(command) || []
    if (!exactEntries.length) return registry.nonExactCommandEntries || []

    // ★ PERF: Cache non-exact callable entries — avoid filtering all entries per command.
    // exactEntries are typically 1-2 plugins. Concatenation is much cheaper than
    // filtering ~100 entries through Set lookup for every command.
    if (!registry._nonExactCallable) {
        registry._nonExactCallable = (registry.entries || []).filter(e =>
            e.isCallable && !e.exactCommands
        )
    }
    return exactEntries.concat(registry._nonExactCallable)
}

module.exports = {
    async handler(chatUpdate) {
        if (global.db.data == null) await loadDatabase()
        maybeCleanupInvalidLidMap()

        // ── Context object: cached di module level, bukan per-pesan ──────
        if (!_cachedCtx) {
            try {
                const { buildContext } = require('./src/core/context')
                _cachedCtx = buildContext({ conn: this, groupMetaCache: groupMetadataCache })
            } catch (_) { _cachedCtx = {} }
        }
        let _ctx = _cachedCtx

        // Bersihkan lidMap yang salah (swa→swa atau lid→lid)

        // console.log(chatUpdate) // Disabled for clean console
        if (!chatUpdate) return
        let m = chatUpdate.messages[chatUpdate.messages.length - 1]
        if (!m) return
        const handlerStartedAt = Date.now()

        // ── FIX: LID mention resolution → setImmediate (non-blocking) ──────
        // Dipindah ke background karena tidak dibutuhkan oleh pipeline command.
        // Menghilangkan ~1-5ms delay per pesan yang punya mention di grup ramai.
        try {
            const _rawMentions = (m.message || {})[Object.keys(m.message || {})[0]]?.contextInfo?.mentionedJid || []
            const _hasLid = _rawMentions.some(lid => lid.endsWith('@lid'))
            if (_hasLid) {
                const _conn = this
                const _senderForLid = m.sender
                setImmediate(async () => {
                    try {
                        const users = getUsersMap()
                        const userIndex = getUserIndex()
                        if (!global.db.data.settings) global.db.data.settings = {}
                        if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                        const lm = global.db.data.settings.lidMap

                        for (const lid of _rawMentions) {
                            if (!lid.endsWith('@lid')) continue
                            const existing = lm[lid]
                            if (existing && !existing.includes('@') && existing.length >= 8) continue
                            const lidNum = lid.split('@')[0]
                            let foundJid = userIndex.byNumber.get(lidNum) || null
                            let foundUser = foundJid ? users[foundJid] : null
                            if (foundJid) logMentionResolution('by-number', { lid, lidNum, foundJid })
                            if (!foundJid) {
                                const lmEntry = Object.entries(lm).find(([k, v]) => k === lid && users[v]?.registered)
                                if (lmEntry) {
                                    foundJid = lmEntry[1]; foundUser = users[foundJid]
                                    logMentionResolution('by-lidmap', { lid, lidNum, foundJid })
                                } else {
                                    try {
                                        const contact = _conn.contacts && _conn.contacts[lid]
                                        const lidName = (contact?.name || contact?.notify || '').trim().toLowerCase()
                                        if (lidName) {
                                            const matchedJid = userIndex.byRegisteredName.get(lidName)
                                            if (matchedJid) {
                                                foundJid = matchedJid; foundUser = users[matchedJid]
                                                lm[lid] = matchedJid
                                                global.db.write().catch(() => {})
                                                logMentionResolution('by-contact-name', { lid, lidNum, foundJid })
                                            }
                                        }
                                    } catch (_) {}
                                    if (!foundJid) {
                                        if (!global._lidNotified) global._lidNotified = {}
                                        if (!global._lidNotified[lid]) {
                                            global._lidNotified[lid] = true
                                            const LOG_GROUP = '120363426689989491@g.us'
                                            const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                                            const ownerJid = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
                                            const ownerTag = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
                                            const mentions = ownerJid ? [ownerJid] : []
                                            const contact = _conn.contacts && _conn.contacts[lid]
                                            const lidName = contact?.name || contact?.notify || '_(tidak diketahui)_'
                                            const triggerSender = _senderForLid || ''
                                            const triggerNum = triggerSender ? jidToNum(triggerSender) : ''
                                            const triggerTag = triggerNum ? `@${triggerNum}` : ''
                                            const triggerMention = triggerNum ? [triggerSender] : []
                                            _conn.sendMessage(LOG_GROUP, { text: fixBrokenEmojiText(`🔔 *LID Tidak Dikenal Terdeteksi!*\n\n👤 *Nama (dari WA):* ${lidName}\n` + (triggerTag ? `📲 *Di-tag oleh:* ${triggerTag}\n` : '') + `\nSiapa pemilik LID ini?\nSalin command di bawah lalu isi nomorWA-nya:\n\n${ownerTag}`), mentions: [...mentions, ...triggerMention] }).catch(() => {})
                                            _conn.sendMessage(LOG_GROUP, { text: `.setlid <nomorWA> ${lidNum}` }).catch(() => {})
                                        }
                                        continue
                                    }
                                }
                            }
                            if (!lm[lid]) { lm[lid] = foundJid; global.db.write().catch(() => {}); logMentionResolution('stored-lidmap', { lid, lidNum, foundJid }) }
                            if (foundUser?.registered) {
                                if (!global._lidNotified) global._lidNotified = {}
                                if (global._lidNotified[lid]) continue
                                const LOG_GROUP = '120363426689989491@g.us'
                                const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                                const ownerJid = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
                                const ownerTag = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
                                const mentions = [numToJid(foundJid), ...(ownerJid ? [ownerJid] : [])]
                                global._lidNotified[lid] = true
                                _conn.sendMessage(LOG_GROUP, { text: fixBrokenEmojiText(`🔔 *LID Terdeteksi!*\n\n👤 *Nama:* ${foundUser.name || displayForJid(foundJid) || lidNum}\n📱 *Nomor WA:* \`${foundJid.split('@')[0]}\`\n\nSalin command di bawah lalu kirim:\n\n${ownerTag}`), mentions }).catch(() => {})
                                _conn.sendMessage(LOG_GROUP, { text: `.setlid ${foundJid.split('@')[0]} ${lidNum}` }).catch(() => {})
                            }
                        }
                    } catch (_) {}
                })
            }
        } catch (_) {}

        // ── Fetch group metadata & simpan LID mapping setiap pesan grup ──
        try {
            if (m.key?.remoteJid?.endsWith('@g.us') && !m.key?.fromMe) {
                const groupId = m.key.remoteJid
                const now = Date.now()
                const last = _groupMetaRefresh.get(groupId) || 0
                if (now - last > 5 * 60 * 1000) {
                    _groupMetaRefresh.set(groupId, now)
                    this.groupMetadata(groupId).then(meta => {
                        if (!meta?.participants?.length) return
                        if (typeof this.saveLidMapping === 'function') {
                            this.saveLidMapping(meta.participants)
                        }
                    }).catch(() => {})
                }
            }
        } catch (_) {}
        
        let _senderNum = ''  // ★ hoisted for finally block access
        try {
            m = simple.smsg(this, m) || m
            if (!m) return

            // ════════════════════════════════════════════════════════════════
            // ★  ULTRA-FAST PATH for non-command messages
            //    Di grup ramai, 95%+ pesan BUKAN command. Jangan proses
            //    pipeline penuh (console log, user init, owner check,
            //    participant scan, plugin loops). Cukup:
            //    1. Dedup  2. LID resolve  3. Before hooks di background
            //    4. Add exp  5. Return immediately
            // ════════════════════════════════════════════════════════════════
            const _isBaileys = m.isBaileys && !(m.mtype === 'templateButtonReplyMessage' || m.mtype === 'interactiveResponseMessage' || m.mtype === 'listResponseMessage' || m.mtype === 'buttonsResponseMessage')
            if (_isBaileys) return

            // Dedup
            try {
                const parsedId = m.key?.id || m.id
                if (parsedId && m.mtype && m.mtype !== 'senderKeyDistributionMessage' && m.mtype !== 'messageContextInfo') {
                    if (_processedMessages.has(parsedId)) return
                    _processedMessages.add(parsedId)
                    if (_processedMessages.size > _MAX_PROCESSED_CACHE) {
                        _processedMessages.delete(_processedMessages.values().next().value)
                    }
                }
            } catch (_) {}

            // ── LID Sender Resolve — FIXED v2 ─────────────────────────────
            // Root cause dari log:
            //   m.sender = "20143849627780" (plain LID, bukan @lid, bukan 62xxx)
            //   m.key.participant = "20143849627780" (juga plain — WA tidak sertakan @lid)
            //
            // Fix: deteksi lebih agresif + senderPn langsung dari m.key sebelum groupMetadata
            try {
                const _shira = require('shiraori-baileys')
                const _extractPhone   = _shira.extractPhoneNumber
                const _isLidJidFn     = _shira.isLidJid

                // Deteksi LID — 3 bentuk yang WA kirim:
                // (A) "xxx@lid"           → _isLidJid = true
                // (B) "20143849627780"    → _isPlainLid = true (≥14 digit, bukan 62xxx)
                // (C) "20143849627780@s.whatsapp.net" → ekstrak number, cek panjang
                const _rawSender = m.sender || ''
                const _isLidJid   = _rawSender.endsWith('@lid')

                // Plain LID: angka ≥11 digit yang BUKAN dimulai dengan 62
                // (nomor WA Indo = 62xxx, LID = angka acak panjang seperti 20143849627780)
                const _senderNum  = _rawSender.includes('@') ? _rawSender.split('@')[0].split(':')[0] : _rawSender
                const _isPlainLid = !_isLidJid && /^\d{11,}$/.test(_senderNum) && !/^62\d{7,}$/.test(_senderNum)

                if (_isLidJid || _isPlainLid) {
                    const _lidNum = _isLidJid ? _rawSender.split('@')[0] : _senderNum
                    const _lid    = _lidNum + '@lid'
                    const _lm     = global.db?.data?.settings?.lidMap

                    const _saveLid = (num) => {
                        try {
                            if (!global.db?.data?.settings) return
                            if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                            if (/^\d{8,15}$/.test(num) && num !== _lidNum) {
                                global.db.data.settings.lidMap[_lid] = num
                                global.db.write().catch(() => {})
                            }
                        } catch (_) {}
                    }

                    let _resolved = null

                    // 1. senderPn / sn — field native WA di message key (paling reliable)
                    //    Baileys 7.x menyertakan nomor HP asli di field ini
                    if (!_resolved) {
                        try {
                            const _rawMsg = m?.message ? m : null
                            const _pn = m.key?.senderPn
                                     || m.key?.sn
                                     || m.key?.pn
                                     || m?.senderPn
                                     || (_rawMsg && Object.values(_rawMsg.message || {})[0]?.contextInfo?.participant)
                            if (_pn && typeof _pn === 'string') {
                                const _pnNum = _pn.replace(/[^0-9]/g, '')
                                if (/^\d{8,15}$/.test(_pnNum) && !/^\d{11,}$/.test(_pnNum) || /^62\d{7,}$/.test(_pnNum)) {
                                    // Pastikan ini nomor WA (62xxx) bukan LID lagi
                                    if (/^62\d{7,}$/.test(_pnNum)) {
                                        _resolved = _pnNum
                                        _saveLid(_pnNum)
                                    }
                                }
                            }
                        } catch (_) {}
                    }

                    // 2. lidMap cache (O(1))
                    if (!_resolved && _lm?.[_lid] && /^\d{8,15}$/.test(_lm[_lid])) {
                        _resolved = _lm[_lid]
                    }

                    // 3. conn.contacts — cari entry yang lid == _lidNum
                    if (!_resolved) {
                        try {
                            // Cek dengan @lid suffix
                            const _c = this.contacts?.[_lid]
                            if (_c?.id && !_isLidJidFn(_c.id)) {
                                const _cn = _extractPhone(_c.id)
                                if (/^62\d{7,}$/.test(_cn)) { _resolved = _cn; _saveLid(_cn) }
                            }
                            // Cek juga tanpa suffix (plain number key di contacts)
                            if (!_resolved) {
                                const _c2 = this.contacts?.[_lidNum]
                                if (_c2?.id && _c2.id.endsWith('@s.whatsapp.net')) {
                                    const _cn2 = _extractPhone(_c2.id)
                                    if (/^62\d{7,}$/.test(_cn2)) { _resolved = _cn2; _saveLid(_cn2) }
                                }
                            }
                        } catch (_) {}
                    }

                    // 4. resolveLid (lidMap + conn.chats scan)
                    if (!_resolved) {
                        try {
                            const _r = this.resolveLid?.(_lid, m.chat)
                            if (_r && _r !== _lid && !_r.endsWith('@lid') && !_r.endsWith('@g.us')) {
                                const _rn = _extractPhone(_r)
                                if (/^62\d{7,}$/.test(_rn)) { _resolved = _rn; _saveLid(_rn) }
                            }
                        } catch (_) {}
                    }

                    // 5. DM fallback
                    if (!_resolved && !m.isGroup && m.chat?.endsWith('@s.whatsapp.net')) {
                        try {
                            const _cn = _extractPhone(m.chat)
                            if (/^62\d{7,}$/.test(_cn)) { _resolved = _cn; _saveLid(_cn) }
                        } catch (_) {}
                    }

                    // 6. LIVE groupMetadata — last resort
                    //    IMPORTANT: Pada WA full-LID, p.id di metadata JUGA berupa LID number
                    //    (bukan @s.whatsapp.net). Field yang bisa dipercaya hanya senderPn.
                    if (!_resolved && m.chat) {
                        try {
                            const _meta = await this.groupMetadata(m.chat)
                            if (_meta?.participants?.length) {
                                // DEBUG: log 1 participant pertama untuk diagnosa
                                if (process.env.DEBUG_LID === 'true') {
                                    const _sample = _meta.participants[0]
                                    console.log('[LID DEBUG] sample p:', JSON.stringify({
                                        id: _sample.id, lid: _sample.lid,
                                        senderPn: _sample.senderPn, pn: _sample.pn,
                                        phoneNumber: _sample.phoneNumber,
                                        keys: Object.keys(_sample)
                                    }))
                                }

                                if (typeof this.saveLidMapping === 'function') {
                                    this.saveLidMapping(_meta.participants)
                                }

                                for (const _p of _meta.participants) {
                                    // Ekstrak semua candidate ID dari participant
                                    const _pIdRaw  = typeof _p.id  === 'string' ? _p.id  : (typeof _p.jid === 'string' ? _p.jid : '')
                                    const _pLidRaw = typeof _p.lid === 'string' ? _p.lid : (typeof _p.lid === 'object' ? String(_p.lid?.user || '') : '')
                                    const _pIdNum  = _pIdRaw.includes('@')  ? _pIdRaw.split('@')[0].split(':')[0]  : _pIdRaw
                                    const _pLidNum = _pLidRaw.includes('@') ? _pLidRaw.split('@')[0].split(':')[0] : _pLidRaw

                                    // Match: p.lid == lidNum ATAU p.id == lidNum (WA full-LID: p.id IS the LID)
                                    const _isMatch = (_pLidNum && _pLidNum === _lidNum) || (_pIdNum && _pIdNum === _lidNum)
                                    if (!_isMatch) continue

                                    // Cocok ditemukan. Coba ambil nomor WA:

                                    // a. p.id berupa @s.whatsapp.net (kasus normal)
                                    if (/^62\d{7,}$/.test(_pIdNum)) {
                                        _resolved = _pIdNum; _saveLid(_pIdNum); break
                                    }

                                    // b. senderPn / phoneNumber / pn (field native WA)
                                    const _ppn = _p.senderPn || _p.phoneNumber || _p.pn
                                    if (_ppn) {
                                        const _ppnNum = String(_ppn).replace(/[^0-9]/g, '')
                                        if (/^62\d{7,}$/.test(_ppnNum)) { _resolved = _ppnNum; _saveLid(_ppnNum); break }
                                    }

                                    // c. Scan semua field participant untuk cari 62xxx
                                    for (const _fv of Object.values(_p)) {
                                        if (typeof _fv !== 'string') continue
                                        const _fNum = _fv.replace(/[^0-9]/g, '')
                                        if (/^62\d{7,}$/.test(_fNum)) { _resolved = _fNum; _saveLid(_fNum); break }
                                    }
                                    if (_resolved) break
                                }

                                // Fallback: cek lidMap yang baru diisi saveLidMapping
                                if (!_resolved) {
                                    const _freshLm = global.db?.data?.settings?.lidMap
                                    if (_freshLm?.[_lid] && /^62\d{7,}$/.test(_freshLm[_lid])) {
                                        _resolved = _freshLm[_lid]
                                    }
                                }
                            }
                        } catch (_) {}
                    }

                    // 7. Ekstrak dari m.message contextInfo mentionedJid / participant fields
                    //    Beberapa WA version menyertakan nomor asli di sini
                    if (!_resolved) {
                        try {
                            const _msgContent = m.message ? Object.values(m.message)[0] : null
                            const _ctxParticipant = _msgContent?.contextInfo?.participant
                            if (_ctxParticipant && typeof _ctxParticipant === 'string') {
                                const _ctxNum = _ctxParticipant.replace(/[^0-9]/g, '')
                                if (/^62\d{7,}$/.test(_ctxNum)) { _resolved = _ctxNum; _saveLid(_ctxNum) }
                            }
                        } catch (_) {}
                    }

                    // 8. Scan SEMUA field di m.key untuk cari 62xxx tersembunyi
                    if (!_resolved) {
                        try {
                            const _scanObj = (obj, depth = 0) => {
                                if (!obj || depth > 3) return null
                                for (const v of Object.values(obj)) {
                                    if (typeof v === 'string') {
                                        const n = v.replace(/[^0-9]/g, '')
                                        if (/^62\d{7,}$/.test(n)) return n
                                    } else if (v && typeof v === 'object') {
                                        const r = _scanObj(v, depth + 1)
                                        if (r) return r
                                    }
                                }
                                return null
                            }
                            const _scanned = _scanObj(m.key)
                            if (_scanned) { _resolved = _scanned; _saveLid(_scanned) }
                        } catch (_) {}
                    }

                    // Apply
                    if (_resolved && /^62\d{7,}$/.test(_resolved)) {
                        console.log(`[LID FIXED] ${_lidNum} → ${_resolved}`)
                        m.sender = _resolved
                        // Fix m.key.participant juga agar plugin-plugin downstream dapat nomor benar
                        if (m.key?.participant) {
                            m.key.participant = _resolved + '@s.whatsapp.net'
                        }
                        if (m.participant) {
                            m.participant = _resolved + '@s.whatsapp.net'
                        }
                    } else {
                        // Benar-benar tidak bisa resolve — log untuk debugging
                        console.log(`[LID UNRESOLVED] sender=${_rawSender} lidNum=${_lidNum} chat=${m.chat || '?'} group=${m.isGroup}`)
                    }
                }
            } catch (_) {}

            // Detect if this is potentially a command
            const _txt = typeof m.text === 'string' ? m.text : ''
            const _pfxChars = '.,!#/xzXZ+i$%+\u00a3\u00a2\u20ac\u00a5^\u00b0=\u00b6\u2206\u00d7\u00f7\u03c0\u221a\u2713\u00a9\u00ae:;?&-'
            const _mightBeCmd = _txt.length > 0 && _pfxChars.includes(_txt[0])
            const _isInteractive = m.mtype === 'templateButtonReplyMessage' || m.mtype === 'interactiveResponseMessage' || m.mtype === 'listResponseMessage' || m.mtype === 'buttonsResponseMessage'

            if (!_mightBeCmd && !_isInteractive && !m.key?.fromMe) {
                // ── FAST PATH: non-command, non-interactive, non-self ──────
                // Fire before hooks in background (chat coins, level up, etc.)
                // Then return immediately — skip ALL heavy processing
                m.exp = Math.ceil(Math.random() * 10)
                const _conn = this
                const _chatUpd = chatUpdate
                setImmediate(async () => {
                    try {
                        const _reg = global.pluginRegistry || { beforeEntries: [] }
                        for (const entry of _reg.beforeEntries) {
                            const plugin = entry.plugin
                            if (!plugin || plugin.disabled || typeof plugin.before !== 'function') continue
                            try { await plugin.before.call(_conn, m, { conn: _conn, chatUpdate: _chatUpd }) } catch (_) {}
                        }
                    } catch (_) {}
                })
                return  // ← EXIT EARLY — no further processing
            }

            // ════════════════════════════════════════════════════════════════
            // ★  COMMAND PATH — full processing for commands & interactive msgs
            // ════════════════════════════════════════════════════════════════

            // ── (LID resolve + dedup sudah dihandle di fast path di atas) ──
            // Command path: sender sudah di-resolve, dedup sudah dicek.

            // ── Console log ringkas & rapi (command only) ─────────────────
            // FIX: Single getDbUser call, no resolveUserIdentity/getUserKey overhead
            _senderNum = jidToNum(m.sender || '') || m.sender?.split('@')[0] || ''
            const _logUser = getDbUser(m.sender)
            // Cache identity di m untuk plugin yang butuh (tanpa resolveUserIdentity overhead)
            m.userIdentity = _logUser?.registered && _logUser?.name ? _logUser.name : _senderNum
            m.userKey = _senderNum
            // ★ PERF: Defer console.log to setImmediate — synchronous I/O blocks event loop.
            // By deferring, the plugin starts executing in the current tick instead of
            // waiting for console I/O (~1-3ms per log line) to complete first.
            if (m.text && typeof m.text === 'string' && !m.key?.fromMe) {
                const _pfx    = (global.prefix instanceof RegExp ? '.' : Array.isArray(global.prefix) ? global.prefix[0] : global.prefix) || '.'
                const display = _logUser?.registered && _logUser?.name
                    ? _logUser.name
                    : (_senderNum || m.name || 'unknown')
                const _logName = String(display || _senderNum).padEnd(15).slice(0, 15)
                const _logIsBtn = m.mtype === 'templateButtonReplyMessage' || m.mtype === 'interactiveResponseMessage' || m.mtype === 'listResponseMessage' || m.mtype === 'buttonsResponseMessage'
                const _regIcon = _logUser?.registered ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
                const _numDisplay = _senderNum || m.sender?.split('@')[0] || '?'
                const _logText = m.text
                const _logMtype = m.mtype
                setImmediate(() => {
                    console.log(`\x1b[90m[MSG]\x1b[0m ${_regIcon} \x1b[1m${_logName.trim()}\x1b[0m \x1b[90m(${_numDisplay})\x1b[0m`)
                    if (_logText.startsWith(_pfx)) {
                        console.log(`\x1b[36m CMD\x1b[0m \x1b[1m${_logText.split(' ')[0]}\x1b[0m \x1b[90m| ${_logName}\x1b[0m`)
                    } else if (_logIsBtn) {
                        console.log(`\x1b[35m BTN\x1b[0m \x1b[1m${_logText}\x1b[0m \x1b[90m| ${_logName}\x1b[0m`)
                    }
                })
            }
            
            // console.log(m) // Disabled
            m.exp = 0
            m.limit = false

            // ── Notif recovery: beritahu user kalau bot baru saja reconnect ──
            // Pesan yang dikirim saat recovery berlangsung tidak diproses oleh handler lama.
            // Notif ini dikirim SEKALI per chat, dalam 45 detik setelah recovery selesai,
            // agar user tahu perlu ketik ulang — command saat ini tetap diproses normal.
            try {
                const _RECOVERY_WINDOW_MS = 45000
                const _recoveryAt = global._lastRecoveryAt || 0
                const _now = Date.now()
                if (
                    _recoveryAt > 0 &&
                    (_now - _recoveryAt) < _RECOVERY_WINDOW_MS &&
                    m.chat &&
                    !m.fromMe
                ) {
                    if (!global._recoveryNotifiedChats) global._recoveryNotifiedChats = new Set()
                    if (!global._recoveryNotifiedChats.has(m.chat)) {
                        global._recoveryNotifiedChats.add(m.chat)
                        const _secAgo = Math.round((_now - _recoveryAt) / 1000)
                        this.sendMessage(m.chat, {
                            text:
                                `⚠️ *Bot baru saja reconnect* (${_secAgo} detik lalu)\n\n` +
                                `Command yang dikirim saat reconnect berlangsung kemungkinan tidak diproses.\n` +
                                `Silakan ketik ulang jika tidak ada respon sebelumnya.`
                        }).catch(() => {})
                    }
                }
                // Clear flag setelah window habis
                if (_recoveryAt > 0 && (_now - _recoveryAt) >= _RECOVERY_WINDOW_MS) {
                    global._lastRecoveryAt = 0
                    global._recoveryNotifiedChats = new Set()
                }
            } catch (_) {}
            try {
                // ── Lookup user: reuse _logUser dari console section (no duplicate getDbUser) ──
                let user         = _logUser || null
                // Entry DB hanya dibuat saat user .daftar (plugin daftar.js)
                let _isNewUser   = !user || typeof user !== 'object'  // null-safe: typeof null === 'object' di JS

                // ── Service: sanitasi user saat ini saja (bukan semua user) ──
                // ★ PERF: sanitizeUser(user) instead of sanitizeAllUsers() — O(1) vs O(n)
                if (m.isCommand && !_isNewUser && global.dbService?.sanitizeUser) {
                    try { global.dbService.sanitizeUser(user) } catch (_) {}
                }

                // lidMap diisi oleh lidMapper di main.js & saveLidMapping di simple.js

                if (_isNewUser) {
                    // Sementara buat object kosong di memori TAPI tidak disimpan ke db
                    // agar plugin bisa cek user.registered === false
                    user = { registered: false, name: m.name, _temp: true }
                }
                if (user) {
                    // ★ PERF: _fieldsInit guard — skip ~16 isNumber/in checks for known users.
                    // Only runs once per user. After that, all fields are guaranteed present.
                    if (!user._fieldsInit) {
                    if (!isNumber(user.exp)) user.exp = 0
                    if (!isNumber(user.limit)) user.limit = 10
                    if (!isNumber(user.lastclaim)) user.lastclaim = 0
                    if (!('registered' in user)) user.registered = false
                    if (!isNumber(user.afk)) user.afk = -1
                    if (!('afkReason' in user)) user.afkReason = ''
                    if (!('banned' in user)) user.banned = false
                    if (!isNumber(user.warn)) user.warn = 0
                    if (!isNumber(user.level)) user.level = 0
                    if (!user.role) user.role = 'Beginner'
                    if (!('autolevelup' in user)) user.autolevelup = true
                    if (!('pet' in user)) user.pet = null
                    if (!isNumber(user.streak)) user.streak = 0
                    if (!isNumber(user.lastwork)) user.lastwork = 0
                    user._fieldsInit = true
                    } // end basic init

                    // Unreg fields — always check (not guarded by _fieldsInit)
                    if (!user.registered) {
                        if (!('name' in user)) user.name = m.name
                        if (!isNumber(user.age)) user.age = -1
                        if (!isNumber(user.regTime)) user.regTime = -1
                    }

                    // EXTENDED INIT: hanya saat command (hemat CPU di grup ramai)
                    // ★ In command path, text always starts with prefix char — skip regex test
                    if (!user._extFieldsInit) {
                    if (!isNumber(user.money)) user.money = 0
                    if (!isNumber(user.healt)) user.healt = 100
                    if (!isNumber(user.limit)) user.limit = 0
                    if (!isNumber(user.potion)) user.potion = 0
                    if (!isNumber(user.sampah)) user.sampah = 0
                    if (!isNumber(user.kayu)) user.kayu = 0
                    if (!isNumber(user.batu)) user.batu = 0
                    if (!isNumber(user.string)) user.string = 0
                    if (!isNumber(user.petFood)) user.petFood = 0
                    if (!isNumber(user.makananpet)) user.makananpet = 0
                    if (!isNumber(user.food)) user.food = 0

                    if (!isNumber(user.emerald)) user.emerald = 0
                    if (!isNumber(user.diamond)) user.diamond = 0
                    if (!isNumber(user.gold)) user.gold = 0
                    if (!isNumber(user.iron)) user.iron = 0

                    if (!isNumber(user.common)) user.common = 0
                    if (!isNumber(user.uncommon)) user.uncommon = 0
                    if (!isNumber(user.mythic)) user.mythic = 0
                    if (!isNumber(user.legendary)) user.legendary = 0
                    if (!isNumber(user.petCount)) user.petCount = 0

                    if (!isNumber(user.kuda)) user.kuda = 0
                    if (!isNumber(user.kudaexp)) user.kudaexp = 0
                    if (!isNumber(user.kucing)) user.kucing = 0
                    if (!isNumber(user.kucingexp)) user.kucingexp = 0
                    if (!isNumber(user.rubah)) user.rubah = 0
                    if (!isNumber(user.rubahexp)) user.rubahexp = 0
                    if (!isNumber(user.anjing)) user.anjing = 0
                    if (!isNumber(user.anjingexp)) user.anjingexp = 0

                    if (!isNumber(user.kudalastfeed)) user.kudalastfeed = 0
                    if (!isNumber(user.kucinglastfeed)) user.kucinglastfeed = 0
                    if (!isNumber(user.rubahlastfeed)) user.rubahlastfeed = 0
                    if (!isNumber(user.anjinglastfeed)) user.anjinglastfeed = 0

                    if (!isNumber(user.armor)) user.armor = 0
                    if (!isNumber(user.armordurability)) user.armordurability = 0
                    if (!isNumber(user.sword)) user.sword = 0
                    if (!isNumber(user.sworddurability)) user.sworddurability = 0
                    if (!isNumber(user.pickaxe)) user.pickaxe = 0
                    if (!isNumber(user.pickaxedurability)) user.pickaxedurability = 0
                    if (!isNumber(user.fishingrod)) user.fishingrod = 0
                    if (!isNumber(user.fishingroddurability)) user.fishingroddurability = 0

                    if (!isNumber(user.lastclaim)) user.lastclaim = 0
                    if (!isNumber(user.lastadventure)) user.lastadventure = 0
                    if (!isNumber(user.lastfishing)) user.lastfishing = 0
                    if (!isNumber(user.lastdungeon)) user.lastdungeon = 0
                    if (!isNumber(user.lastduel)) user.lastduel = 0
                    if (!isNumber(user.lastmining)) user.lastmining = 0
                    if (!isNumber(user.lasthunt)) user.lasthunt = 0
                    if (!isNumber(user.lastweekly)) user.lastweekly = 0
                    if (!isNumber(user.lastmonthly)) user.lastmonthly = 0
                    
                    if (!isNumber(user.warning)) user.warning = 0
                    user._extFieldsInit = true
                    } // end extended init
                } // end if (user)
                // ── User belum daftar: TIDAK disimpan ke DB ──────────────────
                // Entry DB hanya dibuat saat user ketik .daftar (plugins/daftar.js)
                // Kalau user belum daftar, plugin akan lihat user.registered === false
                // dan meminta user .daftar terlebih dahulu
                let chat = global.db.data.chats?.[m.chat]
                if (typeof chat !== 'object') global.db.data.chats[m.chat] = {}
                // FIX: skip field init kalau sudah pernah di-inisialisasi (hemat CPU di grup ramai)
                if (chat && !('_init' in chat)) {
                    if (!('isBanned' in chat)) chat.isBanned = false
                    if (!('welcome' in chat)) chat.welcome = false
                    if (!('detect' in chat)) chat.detect = false
                    if (!('sWelcome' in chat)) chat.sWelcome = ''
                    if (!('sBye' in chat)) chat.sBye = ''
                    if (!('sPromote' in chat)) chat.sPromote = ''
                    if (!('sDemote' in chat)) chat.sDemote = ''
                    if (!('delete' in chat)) chat.delete = true
                    if (!('antiLink' in chat)) chat.antiLink = false
                    if (!('simi' in chat)) chat.simi = false
                    if (!('viewonce' in chat)) chat.viewonce = false
                    if (!('antiToxic' in chat)) chat.antiToxic = false
                    chat._init = true
                } else if (!chat) global.db.data.chats[m.chat] = {
                    isBanned: false,
                    welcome: false,
                    detect: false,
                    sWelcome: '',
                    sBye: '',
                    sPromote: '',
                    sDemote: '',
                    delete: true,
                    antiLink: false,
                    simi: false,
                    viewonce: false,
                    antiToxic: true,
                }
                
        // FIX: settings init — skip kalau sudah punya field utama (hemat 14x 'in' check per pesan)
        let settings = global.db.data.settings
        if (typeof settings !== 'object') global.db.data.settings = {}
        if (settings && !('_init' in settings)) {
          if (!('public' in settings)) settings.public = true
if (!('anon' in settings)) settings.anon = true
if (!('anticall' in settings)) settings.anticall = true
if (!('antispam' in settings)) settings.antispam = true
if (!('antitroli' in settings)) settings.antitroli = true
if (!('backup' in settings)) settings.backup = false
if (!('groupOnly' in settings)) settings.groupOnly = false
if (!('jadibot' in settings)) settings.jadibot = false
if (!('nsfw' in settings)) settings.nsfw = false
if (!('restrict' in settings)) settings.restrict = false
if (!('autoread' in settings)) settings.autoread = false
if (!('welcome' in settings)) settings.welcome = false
if (!('antiToxic' in settings)) settings.antiToxic = false
          if (!isNumber(settings.status)) settings.status = 0
          settings._init = true
        } else if (!settings) global.db.data.settings = {
          anon: true,
          anticall: true,
          antispam: true,
          antitroli: true,
          backup: false,
          backupDB: 0,
          groupOnly: false,
          jadibot: false,
          nsfw: false,
          status: 0,
        }                
            } catch (e) {
                console.error('[handler.initUser]', e?.message || String(e))
            }
            if (opts['nyimak']) return
            if (!m.fromMe && opts['self']) {
                // ★ PERF: reuse cached _senderNum + _cachedOwnerNums instead of recomputing
                if (!_cachedOwnerNums.includes(_senderNum)) return
            }
            if (opts['pconly'] && m.chat.endsWith('g.us')) return
            if (opts['gconly'] && !m.chat.endsWith('g.us')) return
            if (opts['swonly'] && m.chat !== 'status@broadcast') return
            if (typeof m.text !== 'string') m.text = ''
            // (isBaileys check sudah dihandle di fast path di atas)
            const pluginRegistry = global.pluginRegistry || { allEntries: [], beforeEntries: [], nonExactCommandEntries: [], exactCommandMap: new Map(), entries: [] }
            // ★ PERF: Cache prefix matchers — avoid recreating RegExp per message
            const _pfxSrc = conn.prefix ? conn.prefix : global.prefix
            if (_cachedPrefixRaw !== _pfxSrc) {
                _cachedPrefixRaw = _pfxSrc
                _cachedPrefixMatchers = getPrefixMatchers(_pfxSrc)
            }
            const defaultPrefixMatchers = _cachedPrefixMatchers
            const defaultPrefixMatch = resolvePluginMatch({ plugin: {}, hasCustomPrefix: false }, m.text, defaultPrefixMatchers)
            const defaultUsedPrefix = (defaultPrefixMatch[0] || [])[0] || ''
            const defaultNoPrefix = defaultUsedPrefix ? m.text.slice(defaultUsedPrefix.length) : ''
            const defaultParts = defaultUsedPrefix ? defaultNoPrefix.trim().split(/\s+/).filter(Boolean) : []
            const parsedCommand = defaultParts.length ? (defaultParts[0] || '').toLowerCase() : ''

            // FIX: plugin.all hooks dijalankan fire-and-forget (non-blocking)
            // Hasilnya tidak dibutuhkan oleh pipeline command — tidak perlu await.
            // Ini menghilangkan delay dari _antitoxic, _banned, dll di grup ramai.
            for (const entry of pluginRegistry.allEntries) {
                let plugin = entry.plugin
                if (!plugin) continue
                if (plugin.disabled) continue
                // Fire-and-forget: jangan await, biarkan jalan di background
                plugin.all.call(this, m, chatUpdate).catch(e => {
                    if (typeof e === 'string') return
                    console.error('[plugin.all]', e?.message || String(e))
                })
            }
            m.exp += Math.ceil(Math.random() * 10)

            let usedPrefix
            let _user = _logUser || { registered: false, level: 0, limit: 0 }

            // Helper react - kirim emoji reaction
            const react = async (emoji) => {
                try {
                    await this.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
                } catch (_) {}
            }

            // ★ PERF: Reuse _senderNum (already computed at line 388) instead of
            // recomputing senderNumber and senderNumberStripped (identical after LID resolve)
            let senderNumber = _senderNum
            
            // OWNER CHECKER — cached untuk menghindari recompute per pesan
            // Cache owner arrays — global.owner rarely changes
            if (_cachedOwnerRaw !== global.owner) {
                _cachedOwnerRaw = global.owner
                _cachedOwnerNums = global.owner.map(v => v.replace(/[^0-9]/g, ''))
                _cachedOwnerFormatted = global.owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            }
            let ownerNumbers = _cachedOwnerNums
            let ownerFormatted = _cachedOwnerFormatted
            
            let isROwner = ownerNumbers.includes(senderNumber) ||
                           ownerFormatted.includes(m.sender) ||
                           global.owner.includes(m.sender) ||
                           global.owner.includes(senderNumber)
            let isOwner = isROwner || m.fromMe
            
            // Mods and Prems checker (pakai senderNumber yang sudah difix)
            // ★ PERF: Cache mods/prems arrays like owner arrays
            if (_cachedModsRaw !== global.mods) {
                _cachedModsRaw = global.mods
                _cachedModsNums = global.mods.map(v => v.replace(/[^0-9]/g, ''))
            }
            let isMods = isOwner || _cachedModsNums.includes(senderNumber)
            
            if (_cachedPremsRaw !== global.prems) {
                _cachedPremsRaw = global.prems
                _cachedPremsNums = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
            }
            let isPrems = isROwner || _cachedPremsNums.includes(senderNumber)
            let groupMetadata = (m.isGroup ? (conn.chats[m.chat] || {}).metadata : {}) || {}
            let participants = (m.isGroup ? groupMetadata.participants : []) || []
            // FIX: Single-pass participant lookup dengan normalisasi nomor
            // m.sender setelah LID-resolve bisa berupa:
            //   "6281xxx"               (plain number — fallback path)
            //   "6281xxx@s.whatsapp.net" (normal)
            // pid dari decodeJid(p.id) selalu "6281xxx@s.whatsapp.net"
            // → strip domain sebelum compare agar keduanya cocok
            let user = {}, bot = {}
            if (m.isGroup && participants.length) {
                const botJid = this.user.jid
                // senderNum: nomor bersih dari m.sender
                const _sNum = m.sender
                    ? (m.sender.includes('@') ? m.sender.split('@')[0].split(':')[0] : m.sender)
                    : ''
                const _botNum = botJid
                    ? (botJid.includes('@') ? botJid.split('@')[0].split(':')[0] : botJid)
                    : ''
                for (const p of participants) {
                    // ★ PERF: cache decoded JID on participant object
                    const pid = p._dJid || (p._dJid = conn.decodeJid(p.id))
                    // Nomor dari pid
                    const _pNum = pid.includes('@') ? pid.split('@')[0].split(':')[0] : pid
                    if (!user.id && _sNum && (_pNum === _sNum || pid === m.sender)) user = p
                    // Cek juga via p.lid kalau masih @lid
                    if (!user.id && _sNum && p.lid) {
                        const _lNum = typeof p.lid === 'string'
                            ? p.lid.split('@')[0]
                            : (p.lid?.user || '')
                        if (_lNum === _sNum) user = p
                    }
                    if (!bot.id && _botNum && (_pNum === _botNum || pid === botJid)) bot = p
                    if (user.id && bot.id) break
                }
            }
            let isAdmin = user && user.admin || false
            let isBotAdmin = bot && bot.admin || false
            // FIX: before hooks → fire-and-forget (non-blocking)
            // Tidak ada before hook yang memblokir command (semua return true).
            // Ini menghilangkan delay dari _ekonomi, _nikahtick, _shadowtick, dll.
            const _beforeExtra = {
                conn: this, participants, groupMetadata, user, bot, react,
                isROwner, isOwner, isAdmin, isBotAdmin, isPrems,
                chatUpdate, db: global.dbService || null, ..._ctx
            }
            for (const entry of pluginRegistry.beforeEntries) {
                let plugin = entry.plugin
                if (!plugin || plugin.disabled) continue
                if (!opts['restrict']) if (plugin.tags && plugin.tags.includes('admin')) continue
                if (typeof plugin.before !== 'function') continue
                // ★ PERF: skip resolvePluginMatch for hooks that never use match.
                // _ekonomi, _shadowtick, _nikahtick, _autolevelup, _afk, _claimchara
                // all ignore the match parameter — regex exec is wasted CPU.
                const needsMatch = entry.hasCustomPrefix || entry.exactCommands || plugin.command != null
                let match = needsMatch ? resolvePluginMatch(entry, m.text, defaultPrefixMatchers) : null
                plugin.before.call(this, m, { match, ..._beforeExtra }).catch(e => {
                    if (typeof e === 'string') return
                    console.error('[plugin.before]', e?.message || String(e))
                })
            }
            for (const entry of pickCommandEntries(pluginRegistry, parsedCommand)) {
                let plugin = entry.plugin
                let name = entry.name
                if (!plugin) continue
                if (plugin.disabled) continue
                if (!opts['restrict']) if (plugin.tags && plugin.tags.includes('admin')) {
                    continue
                }
                if (typeof plugin !== 'function') continue

                const match = entry.hasCustomPrefix ? resolvePluginMatch(entry, m.text, defaultPrefixMatchers) : defaultPrefixMatch
                if ((usedPrefix = (match[0] || '')[0])) {
                    let noPrefix = entry.hasCustomPrefix ? m.text.replace(usedPrefix, '') : defaultNoPrefix
                    // ★ PERF: single split instead of splitting twice
                    const _splitParts = noPrefix.trim().split` `
                    const _filteredParts = _splitParts.filter(v => v)
                    let command = _filteredParts[0] || ''
                    let args = _filteredParts.slice(1)
                    let _args = _filteredParts.slice(1)
                    let text = _args.join` `
                    command = entry.hasCustomPrefix ? (command || '').toLowerCase() : parsedCommand
                    let fail = plugin.fail || global.dfail // When failed
                    let isAccept = plugin.command instanceof RegExp ? // RegExp Mode?
                        plugin.command.test(command) :
                        Array.isArray(plugin.command) ? // Array?
                            plugin.command.some(cmd => cmd instanceof RegExp ? // RegExp in Array?
                                cmd.test(command) :
                                cmd === command
                            ) :
                            typeof plugin.command === 'string' ? // String?
                                plugin.command === command :
                                false

                    if (!isAccept) continue
                    m.plugin = name
                    const _chatData = global.db.data.chats?.[m.chat]
                    const _userData = _logUser  // ★ PERF: reuse cached getDbUser from line 377
                    if (m.chat in (global.db.data.chats || {}) || !!_userData) {
                        let chat = _chatData
                        let user = _userData
                        if (name != 'unbanchat.js' && chat && chat.isBanned) return // Except this
                        // Cek apakah bot dinonaktifkan di grup ini
if (m.isGroup && chat && chat.botActive === false && !isOwner) return
                        if (name != 'unbanuser.js' && user && user.banned) return
                        // Cek expired sewa grup
                        // Hanya blokir jika expired PERNAH diset (> 0) dan sudah lewat
                        if (m.isGroup && chat && chat.expired > 0 && chat.expired < Date.now()) {
                            // ★ PERF: reuse _cachedOwnerNums instead of recomputing .map()
                            const isOwnerMsg = m.fromMe || _cachedOwnerNums.includes(senderNumber)
                            if (!isOwnerMsg && !name.startsWith('_')) {
                                return conn.reply(m.chat, '⚠️ Masa aktif bot di grup ini sudah *expired*!\n\nSilahkan chat owner untuk menambah masa aktif bot di grup ini.', m)
                            }
                        }
                    }
                    if (plugin.rowner && plugin.owner && !(isROwner || isOwner)) { // Both Owner
                        fail('owner', m, this)
                        continue
                    }
                    if (plugin.rowner && !isROwner) { // Real Owner
                        fail('rowner', m, this)
                        continue
                    }
                    if (plugin.owner && !isOwner) { // Number Owner
                        fail('owner', m, this)
                        continue
                    }
                    if (plugin.mods && !isMods) { // Moderator
                        fail('mods', m, this)
                        continue
                    }
                    if (plugin.premium && !isPrems) { // Premium
                        fail('premium', m, this)
                        continue
                    }
                    if (plugin.group && !m.isGroup) { // Group Only
                        fail('group', m, this)
                        continue
                    } else if (plugin.botAdmin && !isBotAdmin) { // You Admin
                        fail('botAdmin', m, this)
                        continue
                    } else if (plugin.admin && !isAdmin) { // User Admin
                        fail('admin', m, this)
                        continue
                    }
                    if (plugin.private && m.isGroup) { // Private Chat Only
                        fail('private', m, this)
                        continue
                    }
                    if (plugin.register == true && !(_user && _user.registered)) { // Butuh daftar?
                        fail('unreg', m, this)
                        continue
                    }
                    m.isCommand = true
                    let xp = 'exp' in plugin ? parseInt(plugin.exp) : 17 // XP Earning per command
                    if (xp > 200) m.reply('Ngecit -_-') // Hehehe
                    else m.exp += xp
                    if (!isPrems && plugin.limit && (_user.limit || 0) < plugin.limit * 1) {
                        this.reply(m.chat, `Limit anda habis, silahkan beli melalui *${usedPrefix}buy limit*`, m)
                        continue // Limit habis
                    }
                    if (plugin.level > _user.level) {
                        this.reply(m.chat, `diperlukan level ${plugin.level} untuk menggunakan perintah ini. Level kamu ${_user.level}`, m)
                        continue // If the level has not been reached
                    }
                    let extra = {
                        match,
                        usedPrefix,
                        noPrefix,
                        _args,
                        args,
                        command,
                        text,
                        conn: this,
                        participants,
                        groupMetadata,
                        user,
                        bot,
                        isROwner,
                        isOwner,
                        isAdmin,
                        isBotAdmin,
                        isPrems,
                        chatUpdate,
                        db: global.dbService || null,  // ← service tersedia di semua plugin via extra.db
                        ..._ctx,
                    }
                    try {
    await plugin.call(this, m, extra)
    if (!isPrems) m.limit = m.limit || plugin.limit || false
} catch (e) {
    m.error = e
    const rawError = e?.message || String(e)
    const isUserFacingError =
        typeof e === 'string' ||
        (typeof rawError === 'string' && /^(?:[❌⚠️⏳✅📌📍💡💵💍🎰📦🕛🕵️🔄]|(HTTP|API|Format|Nama|Umur|Item|Target|User|Kamu|Belum|Bukan|Gagal|Timeout|Limit|Stok|Uang|Tidak|Harus|Masukkan|Reply|Gunakan|Silakan|Mohon|Semua)\b)/i.test(rawError.trim()))
    if (isUserFacingError) {
        console.log(`[CMD ERROR] ${name}: ${rawError}`)
        await m.reply(rawError)
    } else {
        console.error(`[PLUGIN ERROR] ${name}: ${rawError}`)
    }
    if (e && !isUserFacingError) {
        let text = util.format(e)
        for (let key of Object.values(global.APIKeys))
            text = text.replace(new RegExp(key, 'g'), '#HIDDEN#')

        m.reply(`❌ Terjadi kesalahan pada fitur *${command || name}*.\nCoba lagi atau hubungi owner jika berlanjut.`)

        // Auto kirim error ke grup log
        if (typeof global.sendErrorNotif === 'function') {
            global.sendErrorNotif(this, name, text, m).catch(() => {})
        }
    }
}
                    finally {
                        // m.reply(util.format(_user))
                        if (typeof plugin.after === 'function') {
                            try {
                                await plugin.after.call(this, m, extra)
                            } catch (e) {
                                console.error(e)
                            }
                        }
                        if (m.limit) m.reply(+ m.limit + ' Limit terpakai')
                    }
                    break
                }
            }
        } catch (e) {
            console.error(e)
        } finally {
            let user, stats = global.db.data?.stats || {}
            if (m) {
                // ★ PERF: reuse _senderNum from command path instead of calling jidToNum again
                const _sKey = _senderNum || jidToNum(m.sender)
                if (m.sender && global.db.data?.users && (user = global.db.data.users?.[_sKey])) {
                    user.exp   = (user.exp   || 0) + (m.exp   || 0)
                    user.limit = (user.limit || 0) - (m.limit || 0) * 1

                    // ── Service: wallet cap + bank tax terpusat ──────────────
                    // HANYA untuk command (bukan setiap pesan di grup ramai)
                    if (m.isCommand) {
                    try {
                        if (_dompetModule) {
                            _dompetModule.applyBankTax(user)
                            const _cap = _dompetModule.checkWalletCap(user)
                            if (_cap.triggered) {
                                const _notifJid = m.sender.includes('@') ? m.sender : m.sender + '@s.whatsapp.net'
                                _dompetModule.notifyWalletCap(this, _notifJid, _cap.excess, user.bank).catch(() => {})
                            }
                        }
                    } catch (_) {}
                    }
                }

                let stat
                if (m.plugin) {
                    let now = + new Date
                    if (m.plugin in stats) {
                        stat = stats[m.plugin]
                        if (!isNumber(stat.total)) stat.total = 1
                        if (!isNumber(stat.success)) stat.success = m.error != null ? 0 : 1
                        if (!isNumber(stat.last)) stat.last = now
                        if (!isNumber(stat.lastSuccess)) stat.lastSuccess = m.error != null ? 0 : now
                    } else stat = stats[m.plugin] = {
                        total: 1,
                        success: m.error != null ? 0 : 1,
                        last: now,
                        lastSuccess: m.error != null ? 0 : now
                    }
                    stat.total += 1
                    stat.last = now
                    if (m.error == null) {
                        stat.success += 1
                        stat.lastSuccess = now
                    }
                }
            }

            // try {
            //     require('./lib/print')(m, this)
            // } catch (e) {
            //     console.log(m, m.quoted, e)
            // }
            // ★ PERF: autoread fire-and-forget — don't await chatRead (it's a network call
            // to WA servers that doesn't need to block the handler response)
            if (opts['autoread']) this.chatRead(m.chat, m.isGroup ? m.sender : undefined, m.id || m.key.id).catch(() => { })

            const handlerDuration = Date.now() - handlerStartedAt
            if (handlerDuration >= 1500) {
                const label = m.plugin || m.text?.split?.(' ')?.[0] || m.mtype || 'unknown'
                console.log(`\x1b[33m[SLOW]\x1b[0m ${label} handled in ${handlerDuration}ms`)
            }
        }
    },
    async participantsUpdate({ id, participants, action }) {
        if (opts['self']) return
        if (global.isInit) return

        let chat        = global.db.data?.chats?.[id] || {}
        // welcome aktif jika per-chat ON atau global ON
        const welcomeOn = chat.welcome || global.opts['welcome'] === true

        switch (action) {
            case 'add':
            case 'remove': {
                if (!welcomeOn) break

                let groupMetadata
                try {
                    groupMetadata = await this.groupMetadata(id)
                } catch (_) {
                    groupMetadata = (conn.chats?.[id] || {}).metadata || {}
                }

                const groupName  = groupMetadata?.subject || id
                const groupDesc  = (groupMetadata?.desc || '').replace(/\u0000/g, '').trim() || '-'
                const memberCount = groupMetadata?.participants?.length || 0

                for (const userJid of participants) {
                    try {
                        const userNum  = userJid.split('@')[0].split(':')[0]
                        const userName = this.contacts?.[userJid]?.name
                            || this.contacts?.[userJid]?.notify
                            || global.db.data?.users?.[userNum]?.name
                            || userNum

                        let pp = null
                        try {
                            pp = await this.profilePictureUrl(userJid, 'image')
                        } catch (_) {}

                        if (action === 'add') {
                            // ── Pesan Welcome ─────────────────────────────
                            const tplWelcome = chat.sWelcome
                                || this.welcome
                                || conn.welcome
                                || 'Hai @user, selamat datang di @subject! 👋\n\n@desc'

                            const text = tplWelcome
                                .replace(/@user/g,    '@' + userNum)
                                .replace(/@subject/g, groupName)
                                .replace(/@desc/g,    groupDesc)
                                .replace(/@count/g,   memberCount)

                            await this.sendMessage(id, {
                                text,
                                mentions: [userJid],
                                ...(pp ? { contextInfo: { externalAdReply: {
                                    title: groupName,
                                    body: `Member ke-${memberCount}`,
                                    thumbnailUrl: pp,
                                    sourceUrl: '',
                                    mediaType: 1,
                                    renderLargerThumbnail: false
                                }}} : {})
                            })
                        } else {
                            // ── Pesan Goodbye ─────────────────────────────
                            const tplBye = chat.sBye
                                || this.bye
                                || conn.bye
                                || 'Selamat tinggal @user! 👋'

                            const text = tplBye
                                .replace(/@user/g,    '@' + userNum)
                                .replace(/@subject/g, groupName)
                                .replace(/@desc/g,    groupDesc)
                                .replace(/@count/g,   memberCount)

                            await this.sendMessage(id, {
                                text,
                                mentions: [userJid]
                            })
                        }
                    } catch (e) {
                        console.error('[participantsUpdate] Error kirim welcome/bye:', e?.message || e)
                    }
                }
                break
            }

            case 'promote':
            case 'demote': {
                let text = ''
                if (action === 'promote') {
                    text = chat.sPromote || this.spromote || conn.spromote || '@user sekarang Admin! 🎖️'
                } else {
                    text = chat.sDemote || this.sdemote || conn.sdemote || '@user bukan Admin lagi.'
                }
                const targetNum = participants[0].split('@')[0]
                text = text.replace(/@user/g, '@' + targetNum)
                if (chat.detect) {
                    await this.sendMessage(id, {
                        text,
                        mentions: [participants[0]]
                    }).catch(() => {})
                }
                break
            }
        }
    },
    async delete({ remoteJid, fromMe, id, participant }) {
        if (fromMe) return
        let chats = Object.entries(conn.chats).find(([user, data]) => data.messages && data.messages[id])
        if (!chats) return
        let msg = JSON.parse(chats[1].messages[id])
        let chat = global.db.data?.chats?.[msg.key.remoteJid] || {}
        if (chat.delete) return
        await this.reply(msg.key.remoteJid, `
Terdeteksi @${participant.split`@`[0]} telah menghapus pesan
Untuk mematikan fitur ini, ketik
*.enable delete*
`.trim(), msg, {
            mentions: [participant]
        })
        this.copyNForward(msg.key.remoteJid, msg).catch(e => console.log(e, msg))
    }
}

global.dfail = (type, m, conn) => {
    let msg = {
        rowner: 'Perintah ini hanya dapat digunakan oleh _*OWWNER!1!1!*_',
        owner: 'Perintah ini hanya dapat digunakan oleh _*Owner Bot*_!',
        mods: 'Perintah ini hanya dapat digunakan oleh _*Moderator*_ !',
        premium: 'Perintah ini hanya untuk member _*Premium*_ !',
        group: 'Perintah ini hanya dapat digunakan di grup!',
        private: 'Perintah ini hanya dapat digunakan di Chat Pribadi!',
        admin: 'Perintah ini hanya untuk *Admin* grup!',
        botAdmin: 'Jadikan bot sebagai *Admin* untuk menggunakan perintah ini!',
        unreg: 'Silahkan daftar untuk menggunakan fitur ini dengan cara mengetik:\n\n*.daftar nama.umur*\n\nContoh: *#daftar Manusia.16*',
        restrict: 'Fitur ini di *disable*!'
    }[type]
    if (msg) return m.reply(msg)
}

let fs = require('fs')
let chalk = require('chalk')
let file = require.resolve(__filename)
// Auto-reload dimatikan di mode produksi karena bisa memasang ulang listener
// saat file berubah dan memicu duplicate response / spam.



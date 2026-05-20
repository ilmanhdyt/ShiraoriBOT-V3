const simple = require('./lib/simple')
const util = require('util')
const { jidToNum, numToJid, normalizeMentions, ensureDbUser, getDbUser, displayForJid, resolveUserIdentity, getUserKey } = require('./lib/jidUtils')

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

    const exactSet = new Set(exactEntries)
    return (registry.entries || []).filter(entry =>
        entry.isCallable && (exactSet.has(entry) || !entry.exactCommands)
    )
}

module.exports = {
    async handler(chatUpdate) {
        if (global.db.data == null) await loadDatabase()
        maybeCleanupInvalidLidMap()
        // Bersihkan lidMap yang salah (swa→swa atau lid→lid)
        this.msgqueque = this.msgqueque || []
        // console.log(chatUpdate) // Disabled for clean console
        if (!chatUpdate) return
        let m = chatUpdate.messages[chatUpdate.messages.length - 1]
        if (!m) return
        const handlerStartedAt = Date.now()
        try {
            const rawType = m?.message ? Object.keys(m.message)[0] : 'no-message'
        } catch (_) {}

        // ── DEDUP: tolak pesan yang sudah pernah diproses (LID/JID double-fire) ──
        try {
            const _mid = m.key?.id
            const _rawMsg = m.message || {}
            const _rawType = Object.keys(_rawMsg)[0] || ''
            const _cacheable = !!m.message &&
                Object.keys(_rawMsg).length === 1 &&
                _rawType !== 'senderKeyDistributionMessage' &&
                _rawType !== 'messageContextInfo'
            if (false && _mid && _cacheable) {
                if (_processedMessages.has(_mid)) return
                _processedMessages.add(_mid)
                // Batasi ukuran Set agar tidak leak memori
                if (_processedMessages.size > _MAX_PROCESSED_CACHE) {
                    _processedMessages.delete(_processedMessages.values().next().value)
                }
            }
        } catch (_) {}

        // ── Tangkap raw mentionedJid @lid SEBELUM diproses smsg() ──────
        // simple.js resolve mentionedJid sebelum plugin melihatnya,
        // jadi kita harus tangkap LID asli di sini dari raw message
        try {
            const rawMsg  = m.message || {}
            const mtype   = Object.keys(rawMsg)[0] || ''
            const ctx     = rawMsg[mtype]?.contextInfo || {}
            const rawMentions = ctx.mentionedJid || []
            const groupId = m.key?.remoteJid
            const users = getUsersMap()
            const userIndex = getUserIndex()

            for (const lid of rawMentions) {
                if (!lid.endsWith('@lid')) continue

                if (!global.db.data.settings) global.db.data.settings = {}
                if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                const lm = global.db.data.settings.lidMap

                // Skip kalau sudah ada mapping valid (bukan spekulatif)
                const existing = lm[lid]
                if (existing && !existing.includes('@') && existing.length >= 8) continue // already a number, skip

                const lidNum = lid.split('@')[0]

                // Cari user terdaftar di DB berdasar nomor WA
                let foundJid  = userIndex.byNumber.get(lidNum) || null
                let foundUser = foundJid ? users[foundJid] : null
                if (foundJid) logMentionResolution('by-number', { lid, lidNum, foundJid })

                // Tidak ketemu by nomor = LID asli berbeda dari nomor WA
                if (!foundJid) {
                    // Coba via lidMap reverse
                    const lmEntry = Object.entries(lm).find(([k, v]) =>
                        k === lid && users[v]?.registered
                    )
                    if (lmEntry) {
                        foundJid  = lmEntry[1]
                        foundUser = users[foundJid]
                        logMentionResolution('by-lidmap', { lid, lidNum, foundJid })
                    } else {
                        // Coba cocokkan via pushName dari conn.contacts
                        // conn.contacts[@lid] menyimpan nama display user
                        try {
                            const contact = this.contacts && this.contacts[lid]
                            const lidName = (contact?.name || contact?.notify || '').trim().toLowerCase()
                            if (lidName) {
                                const matchedJid = userIndex.byRegisteredName.get(lidName)
                                if (matchedJid) {
                                    foundJid = matchedJid
                                    foundUser = users[matchedJid]
                                    // Simpan mapping yang ditemukan
                                    lm[lid] = matchedJid
                                    global.db.write().catch(() => {})
                                    logMentionResolution('by-contact-name', { lid, lidNum, foundJid })
                                }
                            }
                        } catch (_) {}

                        // Benar-benar tidak ketemu → kirim notif ke log dengan info terbatas
                        if (!foundJid) {
                            if (!global._lidNotified) global._lidNotified = {}
                            if (!global._lidNotified[lid]) {
                                global._lidNotified[lid] = true
                                const LOG_GROUP = '120363426689989491@g.us'
                                const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                                const ownerJid  = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
                                const ownerTag  = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
                                const mentions  = ownerJid ? [ownerJid] : []
                                const contact   = this.contacts && this.contacts[lid]
                                const lidName   = contact?.name || contact?.notify || '_(tidak diketahui)_'

                                // Coba ambil nomor WA dari console/contacts jika ada
                                // m.sender dari pesan yang menyebabkan LID ini terdeteksi
                                const triggerSender = m?.sender || ''
                                const triggerNum    = triggerSender ? jidToNum(triggerSender) : ''
                                const triggerTag    = triggerNum ? `@${triggerNum}` : ''
                                const triggerMention = triggerNum ? [triggerSender] : []

                                this.sendMessage(LOG_GROUP, {
                                    text: fixBrokenEmojiText(
                                        `🔔 *LID Tidak Dikenal Terdeteksi!*\n\n` +
                                        `👤 *Nama (dari WA):* ${lidName}\n` +
                                        (triggerTag ? `📲 *Di-tag oleh:* ${triggerTag}\n` : '') +
                                        `\nSiapa pemilik LID ini?\n` +
                                        `Salin command di bawah lalu isi nomorWA-nya:\n\n` +
                                        `${ownerTag}`),
                                    mentions: [...mentions, ...triggerMention]
                                }).catch(() => {})
                                this.sendMessage(LOG_GROUP, {
                                    text: `.setlid <nomorWA> ${lidNum}`
                                }).catch(() => {})
                            }
                            continue
                        }
                    }
                }

                // Ketemu by nomor = nomor lid = nomor WA (spekulatif, simpan tapi tidak notif)
                if (!lm[lid]) {
                    lm[lid] = foundJid   // foundJid is phone number
                    global.db.write().catch(() => {})
                    logMentionResolution('stored-lidmap', { lid, lidNum, foundJid })
                }

                // Kalau user sudah daftar, kirim notif LID ke log grup (sekali saja)
                if (foundUser?.registered) {
                    if (!global._lidNotified) global._lidNotified = {}
                    if (global._lidNotified[lid]) continue

                    const LOG_GROUP = '120363426689989491@g.us'
                    const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                    const ownerJid  = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
                    const ownerTag  = ownerJid ? `@${ownerJid.split('@')[0]}` : 'owner'
                    const mentions  = [numToJid(foundJid), ...(ownerJid ? [ownerJid] : [])]

                    global._lidNotified[lid] = true

                    this.sendMessage(LOG_GROUP, {
                        text: fixBrokenEmojiText(
                            `🔔 *LID Terdeteksi!*\n\n` +
                            `👤 *Nama:* ${foundUser.name || displayForJid(foundJid) || lidNum}\n` +
                            `📱 *Nomor WA:* \`${foundJid.split('@')[0]}\`\n` +
                            `\nSalin command di bawah lalu kirim:\n\n` +
                            `${ownerTag}`),
                        mentions
                    }).catch(() => {})

                    // Pesan command siap copy
                    this.sendMessage(LOG_GROUP, {
                        text: `.setlid ${foundJid.split('@')[0]} ${lidNum}`
                    }).catch(() => {})
                }
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
        
        try {
            m = simple.smsg(this, m) || m
            if (!m) return
            try {
                const parsedId = m.key?.id || m.id
                const parsedCacheable = !!parsedId &&
                    !!m.mtype &&
                    m.mtype !== 'senderKeyDistributionMessage' &&
                    m.mtype !== 'messageContextInfo'
                if (parsedCacheable) {
                    if (_processedMessages.has(parsedId)) return
                    _processedMessages.add(parsedId)
                    if (_processedMessages.size > _MAX_PROCESSED_CACHE) {
                        _processedMessages.delete(_processedMessages.values().next().value)
                    }
                }
            } catch (_) {}

            // ── Console log ringkas & rapi ─────────────────────────────────
            if (m.text && typeof m.text === 'string' && !m.key?.fromMe) {
                const _pfx    = (global.prefix instanceof RegExp ? '.' : Array.isArray(global.prefix) ? global.prefix[0] : global.prefix) || '.'
                // Normalisasi sender: selalu pakai nomor HP agar log tidak dobel LID vs JID
                const sender  = jidToNum(m.sender || '')
                const dbUser  = getDbUser(sender || m.sender)
                const resolvedIdentity = resolveUserIdentity(m.sender || sender)
                const identityKey = getUserKey(m.sender || sender)
                m.userIdentity = resolvedIdentity
                m.userKey = identityKey
                const display = dbUser?.registered && dbUser?.name
                    ? dbUser.name
                    : (sender || m.name || 'unknown')
                const name    = String(display || sender).padEnd(15).slice(0, 15)
                const isBtn   = ['templateButtonReplyMessage','interactiveResponseMessage',
                                  'listResponseMessage','buttonsResponseMessage'].includes(m.mtype)
                console.log({
                    sender: m.sender,
                    resolvedNumber: sender,
                    resolvedIdentity,
                    identityKey,
                    registered: !!dbUser?.registered
                })
                if (m.text.startsWith(_pfx)) {
                    const cmd = m.text.split(' ')[0]
                    console.log(`\x1b[36m CMD\x1b[0m \x1b[1m${cmd}\x1b[0m \x1b[90m| ${name}\x1b[0m`)
                } else if (isBtn) {
                    console.log(`\x1b[35m BTN\x1b[0m \x1b[1m${m.text}\x1b[0m \x1b[90m| ${name}\x1b[0m`)
                }
            }
            
            // console.log(m) // Disabled
            m.exp = 0
            m.limit = false
            try {
                // ── Lookup user: DB key = nomor HP via jidToNum ─────────────
                const _senderKey = jidToNum(m.sender)
                let user         = getDbUser(m.sender)
                // Entry DB hanya dibuat saat user .daftar (plugin daftar.js)
                let _isNewUser   = !user || typeof user !== 'object'  // null-safe: typeof null === 'object' di JS

                // lidMap diisi oleh lidMapper di main.js & saveLidMapping di simple.js

                if (_isNewUser) {
                    // Sementara buat object kosong di memori TAPI tidak disimpan ke db
                    // agar plugin bisa cek user.registered === false
                    user = { registered: false, name: m.name, _temp: true }
                }
                if (user) {
                    if (!isNumber(user.exp)) user.exp = 0
                    if (!isNumber(user.limit)) user.limit = 10
                    if (!isNumber(user.lastclaim)) user.lastclaim = 0
                    if (!('registered' in user)) user.registered = false
                    if (!user.registered) {
                        if (!('name' in user)) user.name = m.name
                        if (!isNumber(user.age)) user.age = -1
                        if (!isNumber(user.regTime)) user.regTime = -1
                    }
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
                    if (!isNumber(user.petCount)) user.petCount = 0  // jumlah pet item (lama), bukan objek pet aktif

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
                } // end if (user)
                // ── User belum daftar: TIDAK disimpan ke DB ──────────────────
                // Entry DB hanya dibuat saat user ketik .daftar (plugins/daftar.js)
                // Kalau user belum daftar, plugin akan lihat user.registered === false
                // dan meminta user .daftar terlebih dahulu
                let chat = global.db.data.chats?.[m.chat]
                if (typeof chat !== 'object') global.db.data.chats[m.chat] = {}
                if (chat) {
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
                } else global.db.data.chats[m.chat] = {
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
                
        let settings = global.db.data.settings
        if (typeof settings !== 'object') global.db.data.settings = {}
        if (settings) {
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
          if (!isNumber(settings.status)) settings.status = 0
        } else global.db.data.settings = {
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
    // Izinkan owner tetap bisa pakai bot meski mode self/public off
    let _senderNum = (m.sender || '').split('@')[0].split(':')[0]
    let _ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
    let _isOwner = m.fromMe || _ownerNums.includes(_senderNum)
    if (!_isOwner) return
}
            if (opts['pconly'] && m.chat.endsWith('g.us')) return
            if (opts['gconly'] && !m.chat.endsWith('g.us')) return
            if (opts['swonly'] && m.chat !== 'status@broadcast') return
            if (typeof m.text !== 'string') m.text = ''
            // Skip pesan internal Baileys sedini mungkin agar plugin.all/before
            // tidak ikut memproses event internal yang bukan pesan user.
            if (m.isBaileys && !(m.mtype === 'templateButtonReplyMessage' || m.mtype === 'interactiveResponseMessage' || m.mtype === 'listResponseMessage' || m.mtype === 'buttonsResponseMessage')) return
            const pluginRegistry = global.pluginRegistry || { allEntries: [], beforeEntries: [], nonExactCommandEntries: [], exactCommandMap: new Map(), entries: [] }
            const defaultPrefixMatchers = getPrefixMatchers(conn.prefix ? conn.prefix : global.prefix)
            const defaultPrefixMatch = resolvePluginMatch({ plugin: {}, hasCustomPrefix: false }, m.text, defaultPrefixMatchers)
            const defaultUsedPrefix = (defaultPrefixMatch[0] || [])[0] || ''
            const defaultNoPrefix = defaultUsedPrefix ? m.text.slice(defaultUsedPrefix.length) : ''
            const defaultParts = defaultUsedPrefix ? defaultNoPrefix.trim().split(/\s+/).filter(Boolean) : []
            const parsedCommand = defaultParts.length ? (defaultParts[0] || '').toLowerCase() : ''
            if (opts['queque'] && m.text) {
                const queueId = m.id || m.key.id
                if (!this.msgqueque.includes(queueId)) this.msgqueque.push(queueId)
            }
            for (const entry of pluginRegistry.allEntries) {
                let plugin = entry.plugin
                if (!plugin) continue
                if (plugin.disabled) continue
                try {
                    await plugin.all.call(this, m, chatUpdate)
                } catch (e) {
                    if (typeof e === 'string') continue
                    console.error('[plugin.all]', e?.message || String(e))
                }
            }
            m.exp += Math.ceil(Math.random() * 10)

            let usedPrefix
            let _user = getDbUser(m.sender) || { registered: false, level: 0, limit: 0 }

            // Helper react - kirim emoji reaction
            const react = async (emoji) => {
                try {
                    await this.sendMessage(m.chat, { react: { text: emoji, key: m.key } })
                } catch (_) {}
            }

            // OWNER CHECKER - fix multi-device format (628xxx:10@s.whatsapp.net)
            // Gunakan KEDUA metode ekstraksi agar lebih robust
            let senderNumber = (m.sender || '').split('@')[0].split(':')[0]
            let senderNumberStripped = (m.sender || '').replace(/[^0-9]/g, '')
            let ownerNumbers = global.owner.map(v => v.replace(/[^0-9]/g, ''))
            let ownerFormatted = global.owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
            
            let isROwner = ownerNumbers.includes(senderNumber) ||
                           ownerNumbers.includes(senderNumberStripped) ||
                           ownerFormatted.includes(m.sender) ||
                           global.owner.includes(m.sender) ||
                           global.owner.includes(senderNumber)
            let isOwner = isROwner || m.fromMe
            
            // Mods and Prems checker (pakai senderNumber yang sudah difix)
            let modNumbers = global.mods.map(v => v.replace(/[^0-9]/g, ''))
            let isMods = isOwner || modNumbers.includes(senderNumber)
            
            let premNumbers = (global.prems || []).map(v => v.replace(/[^0-9]/g, ''))
            let isPrems = isROwner || premNumbers.includes(senderNumber)
            let groupMetadata = (m.isGroup ? (conn.chats[m.chat] || {}).metadata : {}) || {}
            let participants = (m.isGroup ? groupMetadata.participants : []) || []
            let user = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) === m.sender) : {}) || {} // User Data
            let bot = (m.isGroup ? participants.find(u => conn.decodeJid(u.id) == this.user.jid) : {}) || {} // Your Data
            let isAdmin = user && user.admin || false // Is User Admin?
            let isBotAdmin = bot && bot.admin || false // Are you Admin?
            for (const entry of pluginRegistry.beforeEntries) {
                let plugin = entry.plugin
                let name = entry.name
                if (!plugin) continue
                if (plugin.disabled) continue
                if (!opts['restrict']) if (plugin.tags && plugin.tags.includes('admin')) {
                    // global.dfail('restrict', m, this)
                    continue
                }
                const needsMatch = entry.hasCustomPrefix || entry.exactCommands || plugin.command != null
                let match = needsMatch ? resolvePluginMatch(entry, m.text, defaultPrefixMatchers) : null
                if (typeof plugin.before === 'function') if (await plugin.before.call(this, m, {
                    match,
                    conn: this,
                    participants,
                    groupMetadata,
                    user,
                    bot,
                    react,
                    isROwner,
                    isOwner,
                    isAdmin,
                    isBotAdmin,
                    isPrems,
                    chatUpdate,
                })) continue
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
                    let [command, ...args] = noPrefix.trim().split` `.filter(v => v)
                    args = args || []
                    let _args = noPrefix.trim().split` `.slice(1)
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
                    const _userData = getDbUser(m.sender)
                    // FIX: pakai getDbUser() yang resolve semua format JID/LID, bukan lookup key langsung
                    // Sebelumnya: jidToNum(m.sender) in (global.db.data.users || {})
                    // bisa false-negative kalau key DB masih format lama (JID lengkap)
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
                            const ownerNums  = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                            const isOwnerMsg = m.fromMe || ownerNums.includes(m.sender.split('@')[0].split(':')[0])
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
                const _sKey = jidToNum(m.sender)
                if (m.sender && global.db.data?.users && (user = global.db.data.users?.[_sKey])) {
                    user.exp   = (user.exp   || 0) + (m.exp   || 0)
                    user.limit = (user.limit || 0) - (m.limit || 0) * 1
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
            if (opts['autoread']) await this.chatRead(m.chat, m.isGroup ? m.sender : undefined, m.id || m.key.id).catch(() => { })
            if (opts['queque'] && m.text) {
                const queueId = m.id || m.key.id
                const queueIndex = this.msgqueque.indexOf(queueId)
                if (queueIndex !== -1) {
                    await delay(Math.min((queueIndex + 1) * 300, 2000))
                }
            }
            const handlerDuration = Date.now() - handlerStartedAt
            if (handlerDuration >= 1500) {
                const label = m.plugin || m.text?.split?.(' ')?.[0] || m.mtype || 'unknown'
                console.log(`\x1b[33m[SLOW]\x1b[0m ${label} handled in ${handlerDuration}ms`)
            }
        }
    },
    async participantsUpdate({ id, participants, action }) {
        if (opts['self']) return
        // if (id in conn.chats) return // First login will spam
        if (global.isInit) return
        let chat = global.db.data?.chats?.[id] || {}
        let text = ''
        switch (action) {
            case 'add':
            case 'remove':
                if (chat.welcome) {
                    let groupMetadata = await this.groupMetadata(id) || (conn.chats[id] || {}).metadata
                    for (let user of participants) {
                        let pp = './src/avatar_contact.png'
                        try {
                            pp = await this.getProfilePicture(user)
                        } catch (e) {
                        } finally {
            let user, stats = global.db.data?.stats || {}
            if (m) {
                const _sKey = jidToNum(m.sender)
                if (m.sender && global.db.data?.users && (user = global.db.data.users?.[_sKey])) {
                    user.exp   = (user.exp   || 0) + (m.exp   || 0)
                    user.limit = (user.limit || 0) - (m.limit || 0) * 1
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
            if (opts['autoread']) await this.chatRead(m.chat, m.isGroup ? m.sender : undefined, m.id || m.key.id).catch(() => {})
            // FIXED: selalu bersihkan queue entry, bahkan saat error — cegah queue menumpuk
            const _qid = m?.id || m?.key?.id
            if (opts['queque'] && _qid) {
                const qi = this.msgqueque.indexOf(_qid)
                if (qi !== -1) this.msgqueque.splice(qi, 1)
            }
        }
                    }
                }
                break
            case 'promote':
                text = (chat.sPromote || this.spromote || conn.spromote || '@user ```is now Admin```')
            case 'demote':
                if (!text) text = (chat.sDemote || this.sdemote || conn.sdemote || '@user ```is no longer Admin```')
                text = text.replace('@user', '@' + participants[0].split('@')[0])
                if (chat.detect) this.sendMessage(id, text, MessageType.extendedText, {
                    contextInfo: {
                        mentionedJid: this.parseMention(text)
                    }
                })
                break
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



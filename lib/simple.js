global.copy = 'https://www.whatsapp.com/otp/copy/'
// ═══════════════════════════════════════════════════════════════════


// ── shiraori-baileys: utility LID + FastMode ──────────────────────
const _shiraBaileys = require('shiraori-baileys')
const {
    extractPhoneNumber,
    extractPhoneNumberFromKey,
    extractPhoneNumberFromMessage,
    isUserJid,
    isGroupJid,
    isLidJid,
    normalizeUserJid,
    toUserJid,
    FastMode,
} = _shiraBaileys

// ── baileys-compat: layer kompatibilitas (native baileys + shiraori-baileys overrides) ────────────
const _baileysPro = require('./baileys-compat')
const makeWASocket             = _baileysPro.default || _baileysPro.makeWASocket || _baileysPro
const makeWALegacySocket       = _baileysPro.makeWALegacySocket
const extractMessageContent    = _baileysPro.extractMessageContent
const makeInMemoryStore        = _baileysPro.makeInMemoryStore
const proto                    = _baileysPro.proto
const prepareWAMessageMedia    = _baileysPro.prepareWAMessageMedia
const downloadContentFromMessage = _baileysPro.downloadContentFromMessage
const getBinaryNodeChild       = _baileysPro.getBinaryNodeChild
const jidDecode                = _baileysPro.jidDecode
const areJidsSameUser          = _baileysPro.areJidsSameUser
const generateWAMessage        = _baileysPro.generateWAMessage
const generateForwardMessageContent = _baileysPro.generateForwardMessageContent
const generateWAMessageFromContent  = _baileysPro.generateWAMessageFromContent
const WAMessageStubType        = _baileysPro.WAMessageStubType
const getContentType           = _baileysPro.getContentType
const relayMessage             = _baileysPro.relayMessage
const WA_DEFAULT_EPHEMERAL     = _baileysPro.WA_DEFAULT_EPHEMERAL
const { toAudio, toPTT, toVideo } = require('./converter')
const chalk = require('chalk')
const fetch = require('node-fetch')
const FileType = require('file-type')
const PhoneNumber = require('awesome-phonenumber')
const fs = require('fs')
const path = require('path')
const pino = require('pino')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./exif')

// Create store with fallback for older Baileys versions
let store
try {
  store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
} catch (e) {
  // Store not needed - silently skip
  store = null
}

exports.makeWASocket = (connectionOptions, options = {}) => {
    let conn = makeWASocket(connectionOptions)

    const originalSendMessage = conn.sendMessage.bind(conn)

    // ── FastMode: tunda & batch send jika fastMode global aktif ─────────
    // FastMode dari shiraori-baileys mencegah rate-limit dan anti-spam WA
    // dengan queue berbasis delay antar JID. Semua send melewati sini.
    const _sendViaFastMode = (jid, content, opts) => {
        if (global.fastMode && typeof global.fastMode.enqueue === 'function') {
            return global.fastMode.enqueue(jid, () => originalSendMessage(jid, content, opts))
        }
        return originalSendMessage(jid, content, opts)
    }

    conn.sendMessage = async (jid, content, options = {}) => {
        if (content && typeof content === 'object') {
            let hasButtons = content.buttons || content.templateButtons || content.nativeFlowMessage || content.listMessage || content.interactiveMessage
            if (hasButtons) {
                let txt = content.text || content.caption || content.contentText || ''
                let footer = content.footer || content.footerText || ''
                let appendedText = txt + (footer ? '\n\n' + footer : '') + '\n\n*[ Pilihan ]*\n'
                
                if (content.buttons) {
                    content.buttons.forEach((b, idx) => {
                        let btnText = b.buttonText ? b.buttonText.displayText : (b.text || b.displayText || b[0] || ('Opsi ' + (idx+1)))
                        appendedText += `- ${btnText}\n`
                    })
                }
                if (content.templateButtons) {
                    content.templateButtons.forEach((b, idx) => {
                        let btnText = b.index || b.quickReplyButton?.displayText || b.urlButton?.displayText || b.callButton?.displayText || ('Opsi ' + (idx+1))
                        appendedText += `- ${btnText}\n`
                    })
                }
                if (content.nativeFlowMessage && content.nativeFlowMessage.buttons) {
                    content.nativeFlowMessage.buttons.forEach((b, idx) => {
                        try {
                            let params = JSON.parse(b.buttonParamsJson)
                            appendedText += `- ${params.display_text}\n`
                        } catch(e) {
                            appendedText += `- Opsi ${idx+1}\n`
                        }
                    })
                }
                if (content.listMessage && content.listMessage.sections) {
                    content.listMessage.sections.forEach(sec => {
                        if (sec.title) appendedText += `\n*${sec.title}*\n`
                        if (sec.rows) {
                            sec.rows.forEach(row => {
                                appendedText += `- ${row.title}\n`
                            })
                        }
                    })
                }
                
                appendedText = appendedText.trim()
                if ('text' in content || 'contentText' in content) {
                    content.text = appendedText
                    delete content.contentText
                }
                if ('caption' in content) {
                    content.caption = appendedText
                }
                if (!('text' in content) && !('caption' in content)) {
                    content.text = appendedText
                }
                
                delete content.buttons
                delete content.templateButtons
                delete content.nativeFlowMessage
                delete content.listMessage
                delete content.interactiveMessage
                delete content.footer
                delete content.footerText
                delete content.viewOnce
            }
        }
        // ── MIGRATED: kirim via FastMode (shiraori-baileys anti-spam queue) ──
        return _sendViaFastMode(jid, content, options)
    }

    const originalRelayMessage = conn.relayMessage.bind(conn)
    conn.relayMessage = async (jid, message, messageOptions) => {
        let msgToInspect = message
        let isViewOnce = false
        if (message?.viewOnceMessage?.message) {
            msgToInspect = message.viewOnceMessage.message
            isViewOnce = true
        }

        let interactive = msgToInspect?.interactiveMessage
        let buttonsMsg = msgToInspect?.buttonsMessage
        let templateMsg = msgToInspect?.templateMessage
        let listMsg = msgToInspect?.listMessage
        
        if (interactive || buttonsMsg || templateMsg || listMsg) {
            let txt = ''
            let footer = ''
            let buttons = []
            let contextInfo = interactive?.contextInfo || buttonsMsg?.contextInfo || templateMsg?.contextInfo || listMsg?.contextInfo || msgToInspect?.messageContextInfo || {}

            if (interactive) {
                txt = (interactive.header?.title || interactive.header?.subtitle || '') + '\n' + (interactive.body?.text || '')
                footer = interactive.footer?.text || ''
                if (interactive.nativeFlowMessage?.buttons) {
                     interactive.nativeFlowMessage.buttons.forEach(b => {
                         try {
                             let params = JSON.parse(b.buttonParamsJson)
                             buttons.push(params.display_text)
                         } catch(e) {}
                     })
                }
            } else if (buttonsMsg) {
                txt = buttonsMsg.contentText || ''
                footer = buttonsMsg.footerText || ''
                if (buttonsMsg.buttons) {
                    buttonsMsg.buttons.forEach(b => buttons.push(b.buttonText?.displayText || ''))
                }
            } else if (templateMsg) {
                txt = templateMsg.hydratedTemplate?.hydratedContentText || ''
                footer = templateMsg.hydratedTemplate?.hydratedFooterText || ''
                if (templateMsg.hydratedTemplate?.hydratedButtons) {
                    templateMsg.hydratedTemplate.hydratedButtons.forEach(b => {
                        buttons.push(b.index || b.quickReplyButton?.displayText || b.urlButton?.displayText || b.callButton?.displayText || '')
                    })
                }
            } else if (listMsg) {
                txt = listMsg.description || ''
                footer = listMsg.footerText || ''
                if (listMsg.sections) {
                     listMsg.sections.forEach(sec => {
                         if (sec.title) buttons.push(`*${sec.title}*`)
                         if (sec.rows) sec.rows.forEach(r => buttons.push(r.title))
                     })
                }
            }

            txt = txt.trim()
            let appendedText = txt + (footer ? '\n\n' + footer : '') + (buttons.length ? '\n\n*[ Pilihan ]*\n' : '')
            buttons.forEach((b, idx) => {
                if (b) appendedText += `- ${b}\n`
                else appendedText += `- Opsi ${idx+1}\n`
            })
            appendedText = appendedText.trim()

            let newContent = {}
            if (interactive?.header?.hasMediaAttachment) {
                if (interactive.header.imageMessage) {
                    interactive.header.imageMessage.caption = appendedText
                    interactive.header.imageMessage.contextInfo = contextInfo
                    newContent = { imageMessage: interactive.header.imageMessage }
                } else if (interactive.header.videoMessage) {
                    interactive.header.videoMessage.caption = appendedText
                    interactive.header.videoMessage.contextInfo = contextInfo
                    newContent = { videoMessage: interactive.header.videoMessage }
                } else if (interactive.header.documentMessage) {
                    interactive.header.documentMessage.caption = appendedText
                    interactive.header.documentMessage.contextInfo = contextInfo
                    newContent = { documentMessage: interactive.header.documentMessage }
                } else {
                    newContent = { extendedTextMessage: { text: appendedText, contextInfo } }
                }
            } else if (buttonsMsg?.imageMessage) {
                buttonsMsg.imageMessage.caption = appendedText
                buttonsMsg.imageMessage.contextInfo = contextInfo
                newContent = { imageMessage: buttonsMsg.imageMessage }
            } else if (templateMsg?.hydratedTemplate?.imageMessage) {
                templateMsg.hydratedTemplate.imageMessage.caption = appendedText
                templateMsg.hydratedTemplate.imageMessage.contextInfo = contextInfo
                newContent = { imageMessage: templateMsg.hydratedTemplate.imageMessage }
            } else {
                newContent = { extendedTextMessage: { text: appendedText, contextInfo } }
            }

            if (isViewOnce) {
                message.viewOnceMessage.message = newContent
            } else {
                for (let k in message) delete message[k]
                Object.assign(message, newContent)
            }
        }
        
        return originalRelayMessage(jid, message, messageOptions)
    }

    // ── sendCarousel: kirim carousel message asli ───────────────────────
    // DIPINDAHKAN dari simple.js (versi standalone shiraori-baileys custom
    // socket) lalu diadaptasi ke arsitektur @whiskeysockets/baileys di
    // LID_fix_v3. Dikirim lewat originalRelayMessage (bukan conn.relayMessage
    // yang sudah di-override jadi fallback teks di atas), supaya carousel
    // tetap terkirim dalam format aslinya alih-alih dikonversi ke teks.
    const { buildCarousel, buildCtaUrl, buildCtaCall, buildListMessage } = require('shiraori-baileys/dist/messages/interactive.js')
    conn.sendCarousel = async (jid, opts, sendOpts = {}) => {
        if (!opts.cards?.length) throw new Error('[shiraori] sendCarousel: cards array is empty')
        const userJid = conn.user?.id || conn.user?.jid || ''
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: { interactiveMessage: buildCarousel(opts) }
            }
        }, { userJid, ...sendOpts })

        await originalRelayMessage(jid, msg.message, { messageId: msg.key.id })
        return msg
    }

    // ── sendCtaUrl / sendCtaCall / sendListMessage ──────────────────────
    // DIPINDAHKAN dari simple.js (versi standalone) dengan pola adaptasi
    // yang sama seperti sendCarousel di atas: dikirim lewat
    // originalRelayMessage supaya tidak ikut dikonversi ke fallback teks.
    conn.sendCtaUrl = async (jid, opts, sendOpts = {}) => {
        const userJid = conn.user?.id || conn.user?.jid || ''
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: { interactiveMessage: buildCtaUrl(opts) }
            }
        }, { userJid, ...sendOpts })

        await originalRelayMessage(jid, msg.message, { messageId: msg.key.id })
        return msg
    }

    conn.sendCtaCall = async (jid, opts, sendOpts = {}) => {
        const userJid = conn.user?.id || conn.user?.jid || ''
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: { interactiveMessage: buildCtaCall(opts) }
            }
        }, { userJid, ...sendOpts })

        await originalRelayMessage(jid, msg.message, { messageId: msg.key.id })
        return msg
    }

    conn.sendListMessage = async (jid, opts, sendOpts = {}) => {
        if (!opts.sections?.length) throw new Error('[shiraori] sendListMessage: sections array is empty')
        const userJid = conn.user?.id || conn.user?.jid || ''
        const msg = generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: { listMessage: buildListMessage(opts) }
            }
        }, { userJid, ...sendOpts })

        await originalRelayMessage(jid, msg.message, { messageId: msg.key.id })
        return msg
    }

    conn.loadMessage = (messageID) => {
      return Object.entries(conn.chats)
      .filter(([_, { messages }]) => typeof messages === 'object')
      .find(([_, { messages }]) => Object.entries(messages)
      .find(([k, v]) => (k === messageID || v.key?.id === messageID)))
      ?.[1].messages?.[messageID]
    }

    // ── decodeJid: normalize multi-device JID ────────────────────────────
    // Menggunakan normalizeUserJid dari shiraori-baileys sebagai utama,
    // dengan fallback ke jidDecode Baileys untuk format non-standar.
    conn.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            // Multi-device format: "628xxx:15@s.whatsapp.net" → "628xxx@s.whatsapp.net"
            try {
                return normalizeUserJid(jid)
            } catch (_) {
                let decode = jidDecode(jid) || {}
                return decode.user && decode.server && decode.user + '@' + decode.server || jid
            }
        } else return jid
    }
    if (conn.user && conn.user.id) conn.user.jid = conn.decodeJid(conn.user.id)
    conn.chats = {}
    conn.contacts = {}

    // ── resolveLid: resolve LID → @s.whatsapp.net ───────────────────────
    // MIGRATED: sekarang pakai extractPhoneNumber dari shiraori-baileys
    // sebagai tahap awal (handles semua format @lid, @s.whatsapp.net, plain)
    conn.resolveLid = function(lid, groupId) {
        if (!lid || !lid.endsWith('@lid')) return lid
        const _lidNum = lid.split('@')[0]

        // 0. Cek dulu: apakah lid num ini sebenarnya nomor WA biasa (62xxx)?
        //    Jika iya, langsung kembalikan sebagai @s.whatsapp.net — ini bukan LID asli.
        if (/^62\d{7,}$/.test(_lidNum)) {
            return _lidNum + '@s.whatsapp.net'
        }

        // 1. lidMap (paling cepat O(1))
        try {
            const lidMap = global.db?.data?.settings?.lidMap
            if (lidMap?.[lid]) {
                const mapped = lidMap[lid]
                const mappedNum = mapped.includes('@') ? mapped.split('@')[0].split(':')[0] : mapped
                if (/^\d{8,15}$/.test(mappedNum)) return mappedNum + '@s.whatsapp.net'
            }
        } catch (_) {}

        // 2. Cari di cached group metadata (conn.chats)
        try {
            const meta = groupId && conn.chats[groupId]?.metadata
            if (meta?.participants) {
                for (const p of meta.participants) {
                    if (!p.lid) continue
                    const pLidDecoded = conn.decodeJid(p.lid)
                    if (pLidDecoded !== lid) continue
                    // Cocok — gunakan extractPhoneNumber dari shiraori-baileys
                    const pRawId = p.id || p.jid || ''
                    if (pRawId) {
                        // extractPhoneNumber handles semua format termasuk @lid
                        const pNum = extractPhoneNumber(pRawId)
                        if (pNum && /^\d{8,15}$/.test(pNum) && !/^62\d{3,}$/.test(pLidDecoded.split('@')[0])) {
                            // Hanya pakai kalau p.id adalah nomor asli (bukan @lid lagi)
                            if (!isLidJid(pRawId)) {
                                return pNum + '@s.whatsapp.net'
                            }
                        }
                    }
                    // p.id masih @lid — ambil dari senderPn
                    const pPn = p.senderPn || p.phoneNumber || p.pn
                    if (pPn) {
                        const pPnNum = String(pPn).replace(/[^0-9]/g, '')
                        if (/^\d{8,15}$/.test(pPnNum)) {
                            try {
                                if (global.db?.data?.settings?.lidMap) {
                                    global.db.data.settings.lidMap[lid] = pPnNum
                                    global.db.write().catch(() => {})
                                }
                            } catch (_) {}
                            return pPnNum + '@s.whatsapp.net'
                        }
                    }
                }
            }
        } catch (_) {}

        // 3. Cari di contacts
        try {
            for (const [jid, contact] of Object.entries(conn.contacts)) {
                if (!jid.endsWith('@s.whatsapp.net')) continue
                if (contact.lid === lid || contact.lid === _lidNum) {
                    const cNum = extractPhoneNumber(jid) // pakai shiraori-baileys
                    if (/^\d{8,15}$/.test(cNum)) return cNum + '@s.whatsapp.net'
                }
            }
        } catch (_) {}

        return lid // fallback kembalikan lid asli
    }

    // Simpan mapping lid → swa dari participant saat join/update grup
    // ── saveLidMapping: simpan mapping LID → nomor WA ─────────────────────
    // MIGRATED: pakai extractPhoneNumber dari shiraori-baileys untuk ekstraksi nomor
    conn.saveLidMapping = function(participants) {
        try {
            if (!global.db?.data?.settings) return
            if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
            const LOG_GROUP = '120363426689989491@g.us'

            for (const p of participants) {
                // Ambil lid — bisa string "xxx@lid", object {user,server}, atau null
                let lid = null
                if (typeof p.lid === 'string' && p.lid) {
                    lid = p.lid.includes('@') ? p.lid : p.lid + '@lid'
                } else if (p.lid && typeof p.lid === 'object' && p.lid.user) {
                    lid = `${p.lid.user}@${p.lid.server || 'lid'}`
                }

                if (!lid || !lid.endsWith('@lid')) continue

                // Ambil nomor WA menggunakan extractPhoneNumber dari shiraori-baileys
                // (handles semua format: @s.whatsapp.net, @lid, multi-device :N@, plain)
                let swaNum = null
                const _rawId = (typeof p.id === 'string' && p.id) || (typeof p.jid === 'string' && p.jid) || ''

                if (_rawId && !isLidJid(_rawId)) {
                    // p.id sudah berupa @s.whatsapp.net atau format yang bisa diekstrak
                    const _extracted = extractPhoneNumber(_rawId) // shiraori-baileys
                    if (_extracted && /^62\d{7,}$/.test(_extracted)) {
                        swaNum = _extracted
                    } else if (_extracted && /^\d{8,15}$/.test(_extracted) && !/^\d{11,}$/.test(_extracted)) {
                        // Angka pendek (<11 digit) — kemungkinan nomor WA non-Indonesia
                        swaNum = _extracted
                    }
                }
                // Juga coba senderPn — lebih reliable dari p.id kalau p.id masih @lid/plain LID
                if (!swaNum) {
                    const _pn = p.senderPn || p.phoneNumber || p.pn
                    if (_pn) {
                        const _pnStr = String(_pn).replace(/[^0-9]/g, '')
                        if (/^62\d{7,}$/.test(_pnStr)) swaNum = _pnStr
                    }
                }

                if (!swaNum || !/^\d{8,15}$/.test(swaNum)) continue

                // Sanity check: jangan simpan kalau lid num == nomor WA (bukan LID asli)
                const lidNum = lid.split('@')[0]
                if (lidNum === swaNum) continue

                const isNew = !global.db.data.settings.lidMap[lid]
                global.db.data.settings.lidMap[lid] = swaNum

                console.log('[LID MAP]', lid, '→', swaNum, isNew ? '(baru)' : '(update)')

                // Kalau mapping baru dan user sudah daftar, kirim notif ke log grup
                if (isNew) {
                    const users    = global.db.data?.users || {}
                    const userData = users[swaNum] || users[swaNum + '@s.whatsapp.net'] || users[lid]
                    if (userData?.registered) {
                        const ownerNums = (global.owner || []).map(v => v.replace(/[^0-9]/g, ''))
                        const ownerJid  = ownerNums.length ? ownerNums[0] + '@s.whatsapp.net' : null
                        const mentions  = ownerJid ? [ownerJid] : []
                        const ownerTag  = ownerJid ? `@${ownerNums[0]}` : 'owner'
                        conn.sendMessage(LOG_GROUP, {
                            text:
                                `✅ *LID berhasil terdeteksi!*\n\n` +
                                `👤 *Nama:* ${userData.name}\n` +
                                `📱 *Nomor WA:* \`${swaNum}\`\n` +
                                `🔑 *LID:* \`${lidNum}\`\n\n` +
                                `_Database sudah terkonfirmasi otomatis!_\n\n` +
                                `👑 ${ownerTag}`,
                            mentions
                        }).catch(() => {})
                        global.db.write().catch(() => {})
                    }
                }
            }
        } catch (e) {
            console.log('[saveLidMapping error]', e.message)
        }
    }

    function updateNameToDb(contacts) {
        if (!contacts) return
        for (let contact of contacts) {
            let id = conn.decodeJid(contact.id)
            if (!id) continue
            let chats = conn.contacts[id]
            if (!chats) chats = { id }
            let chat = {
                ...chats,
                ...({
                    ...contact, id, ...(id.endsWith('@g.us') ?
                        { subject: contact.subject || chats.subject || '' } :
                        { name: contact.notify || chats.name || chats.notify || '' })
                } || {})
            }
            conn.contacts[id] = chat
        }
    }
    conn.ev.on('contacts.upsert', updateNameToDb)
    conn.ev.on('groups.update', updateNameToDb)
    conn.ev.on('group-participants.update', async function updateParticipantsToDb({ id, participants, action }) {
        id = conn.decodeJid(id)
        if (!(id in conn.contacts)) conn.contacts[id] = { id }
        let groupMetadata = Object.assign((conn.contacts[id].metadata || {}), await conn.groupMetadata(id))
        // Simpan mapping LID → SWA dari participant
        if (groupMetadata?.participants) conn.saveLidMapping(groupMetadata.participants)
        for (let participant of participants) {
            participant = conn.decodeJid(participant)
            switch (action) {
                case 'add': {
                    if (participant == conn.user.jid) groupMetadata.readOnly = false
                    let same = (groupMetadata.participants || []).find(user => user && user.id == participant)
                    if (!same) groupMetadata.participants.push({ id, admin: null })
                }
                    break
                case 'remove': {
                    if (participant == conn.user.jid) groupMetadata.readOnly = true
                    let same = (groupMetadata.participants || []).find(user => user && user.id == participant)
                    if (same) {
                        let index = groupMetadata.participants.indexOf(same)
                        if (index !== -1) groupMetadata.participants.splice(index, 1)
                    }
                }
                    break
            }
        }
        conn.contacts[id] = {
            ...conn.contacts[id],
            subject: groupMetadata.subject,
            desc: groupMetadata.desc.toString(),
            metadata: groupMetadata
        }
    })

    conn.ev.on('groups.update', function groupUpdatePushToDb(groupsUpdates) {
        for (let update of groupsUpdates) {
            let id = conn.decodeJid(update.id)
            if (!id) continue
            if (!(id in conn.contacts)) conn.contacts[id] = { id }
            if (!conn.contacts[id].metadata) conn.contacts[id].metadata = {}
            let subject = update.subject
            if (subject) conn.contacts[id].subject = subject
            let announce = update.announce
            if (announce) conn.contacts[id].metadata.announce = announce
        }
    })
    conn.ev.on('chats.upsert', function chatsUpsertPushToDb(chats_upsert) { // FIX: log dihapus

    })
    conn.ev.on('presence.update', function presenceUpdatePushToDb({ id, presences }) {
        let sender = Object.keys(presences)[0] || id
        let _sender = conn.decodeJid(sender)
        let presence = presences[sender]['lastKnownPresence'] || 'composing'
        if (!(_sender in conn.contacts)) conn.contacts[_sender] = {}
        conn.contacts[_sender].presences = presence
    })

    conn.logger = {
        ...conn.logger,
        info()  {},  // silent - terlalu verbose
        error() {},  // error baileys internal diabaikan
        warn()  {}   // warning baileys internal diabaikan
    }

    /**
     * getBuffer hehe
     * @param {String|Buffer} path
     * @param {Boolean} returnFilename
     */
    conn.getFile = async (PATH, returnAsFilename) => {
        let res, filename
        let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
        let type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        if (data && returnAsFilename && !filename) (filename = path.join(__dirname, '../tmp/' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data))
        return {
            res,
            filename,
            ...type,
            data
        }
    }

    /**
     * waitEvent
     * @param {*} eventName 
     * @param {Boolean} is 
     * @param {Number} maxTries 
     * @returns 
     */
    conn.waitEvent = (eventName, is = () => true, maxTries = 25) => {
        return new Promise((resolve, reject) => {
            let tries = 0
            let on = (...args) => {
                if (++tries > maxTries) reject('Max tries reached')
                else if (is()) {
                    conn.ev.off(eventName, on)
                    resolve(...args)
                }
            }
            conn.ev.on(eventName, on)
        })
    }

    /**
    * Send Media All Type 
    * @param {String} jid
    * @param {String|Buffer} path
    * @param {Object} quoted
    * @param {Object} options 
    */
    conn.sendMedia = async (jid, path, quoted, options = {}) => {
        let { ext, mime, data } = await conn.getFile(path)
        messageType = mime.split("/")[0]
        pase = messageType.replace('application', 'document') || messageType
        return await conn.sendMessage(jid, { [`${pase}`]: data, mimetype: mime, ...options }, { quoted, ephemeralExpiration: 86400 })
    }

    /**
    * Translate Text 
    * @param {String} code
    * @param {String|Buffer} text
    */
    conn.translate = async (code, text) => {
      let tr = require('translate-google-api')
      return tr(text, { from: 'id', to: code })
    }

    /**
    * Send Media/File with Automatic Type Specifier
    * @param {String} jid
    * @param {String|Buffer} path
    * @param {String} filename
    * @param {String} caption
    * @param {Object} quoted
    * @param {Boolean} ptt
    * @param {Object} options
    */
    conn.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await conn.getFile(path, true)
        let { res, data: file, filename: pathFile } = type
        if (res && res.status !== 200 || file.length <= 65536) {
            try { throw { json: JSON.parse(file.toString()) } }
            catch (e) { if (e.json) throw e.json }
        }
        let opt = { filename }
        if (quoted) opt.quoted = quoted
        if (!type) if (options.asDocument) options.asDocument = true
        let mtype = '', mimetype = type.mime
        if (/webp/.test(type.mime)) mtype = 'sticker'
        else if (/image/.test(type.mime)) mtype = 'image'
        else if (/video/.test(type.mime)) mtype = 'video'
        else if (/audio/.test(type.mime)) (
            convert = await (ptt ? toPTT : toAudio)(file, type.ext),
            file = convert.data,
            pathFile = convert.filename,
            mtype = 'audio',
            mimetype = 'audio/ogg; codecs=opus'
        )
        else mtype = 'document'
        return await conn.sendMessage(jid, {
            ...options,
            caption,
            ptt,
            [mtype]: { url: pathFile },
            mimetype
        }, {
            ephemeralExpiration: 86400,
            ...opt,
            ...options
        })
    }

    /**
   * Send Contact
   * @param {String} jid 
   * @param {String} number 
   * @param {String} name 
   * @param {Object} quoted 
   * @param {Object} options 
   */
    conn.sendContact = async (jid, number, name, quoted, options) => {
        number = number.replace(/[^0-9]/g, '')
        let njid = number + '@s.whatsapp.net'
        let biz = await conn.getBusinessProfile(njid) || {}
        let { exists } = await conn.onWhatsApp(njid) || { exists: false}
        let vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${name.replace(/\n/g, '\\n')}
ORG:
item1.TEL;waid=${number}:${(()=>{try{return PhoneNumber('+'+number).getNumber('international')||'+'+number}catch(_){return '+'+number}})()}
item1.X-ABLabel:Ponsel${biz.description ? `
item2.EMAIL;type=INTERNET:${(biz.email || '').replace(/\n/g, '\\n')}
item2.X-ABLabel:Email
PHOTO;BASE64:${(await conn.getFile(await conn.profilePictureUrl(njid)).catch(_ => ({})) || {}).number?.toString('base64')}
X-WA-BIZ-DESCRIPTION:${(biz.description || '').replace(/\n/g, '\\n')}
X-WA-BIZ-NAME:${name.replace(/\n/g, '\\n')}
` : ''}
END:VCARD
`.trim()
        return await conn.sendMessage(jid, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        }, { quoted, ...options, ephemeralExpiration: 86400 })
    }

    conn.sendKontak = async (jid, data, quoted, options) => {
        let contacts = []
        for (let [number, nama, ponsel, email] of data) {
            number = number.replace(/[^0-9]/g, '')
            let njid = number + '@s.whatsapp.net'
            let _njidKey = (typeof jidToNum === 'function' ? jidToNum(njid) : njid.split('@')[0].split(':')[0])
            let name = db.data.users[_njidKey] ? db.data.users[_njidKey].name : conn.getName(njid)
            let biz = await conn.getBusinessProfile(njid) || {}
            // N:;${name.replace(/\n/g, '\\n').split(' ').reverse().join(';')};;;
            let vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${name.replace(/\n/g, '\\n')}
ORG:
item1.TEL;waid=${number}:${(()=>{try{return PhoneNumber('+'+number).getNumber('international')||'+'+number}catch(_){return '+'+number}})()}
item1.X-ABLabel:📌 ${ponsel}
item2.EMAIL;type=INTERNET:${email}
item2.X-ABLabel:✉️ Email
X-WA-BIZ-DESCRIPTION:${(biz.description || '').replace(/\n/g, '\\n')}
X-WA-BIZ-NAME:${name.replace(/\n/g, '\\n')}
END:VCARD
`.trim()
            contacts.push({ vcard, displayName: name })

        }
        return await conn.sendMessage(jid, {
            contacts: {
                 ...options,
                displayName: (contacts.length > 1 ? `${contacts.length} kontak` : contacts[0].displayName) || null,
                contacts,
            },
        }, { quoted, ...options, ephemeralExpiration: 86400 })
    }
    
    /**
     * Send Contact Array
     * @param {String} jid 
     * @param {String} number 
     * @param {String} name 
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendContactArrayS = async (jid, data, quoted, options) => {
        let contacts = []
        for (let [number, name, isi, isi1, isi2, isi3, isi4, isi5] of data) {
            number = number.replace(/[^0-9]/g, '')
            let njid = number + '@s.whatsapp.net'
            let biz = await conn.getBusinessProfile(njid) || {}
            // N:;${name.replace(/\n/g, '\\n').split(' ').reverse().join(';')};;;
            let vcard = `
BEGIN:VCARD
VERSION:3.0
N:Sy;Bot;;;
FN:${name.replace(/\n/g, '\\n')}
item.ORG:${isi}
item1.TEL;waid=${number}:${(()=>{try{return PhoneNumber('+'+number).getNumber('international')||'+'+number}catch(_){return '+'+number}})()}
item1.X-ABLabel:${isi1}
item2.EMAIL;type=INTERNET:${isi2}
item2.X-ABLabel:📧 Email
item3.ADR:;;${isi3};;;;
item3.X-ABADR:ac
item3.X-ABLabel:📍 Region
item4.URL:${isi4}
item4.X-ABLabel:Website
item5.X-ABLabel:${isi5}
END:VCARD`.trim()
            contacts.push({ vcard, displayName: name })

        }
        return await conn.sendMessage(jid, {
            contacts: {
                displayName: (contacts.length > 1 ? `2013 kontak` : contacts[0].displayName) || null,
                contacts,
            }
        },
            {
                quoted,
                ...options
            })
    }

    /**
    *status 
    */
    conn.setBio = async (status) => {
        return await conn.query({
            tag: 'iq',
            attrs: {
                to: 's.whatsapp.net',
                type: 'set',
                xmlns: 'status',
            },
            content: [
                {
                    tag: 'status',
                    attrs: {},
                    content: Buffer.from(status, 'utf-8')
                }
            ]
        })
        // <iq to="s.whatsapp.net" type="set" xmlns="status" id="21168.6213-69"><status>"Hai, saya menggunakan WhatsApp"</status></iq>
    }

    /**
     * Reply to a message
     * @param {String} jid
     * @param {String|Object} text
     * @param {Object} quoted
     * @param {Object} mentions [m.sender]
     */
    conn.reply = (jid, text = '', quoted, options) => {
        const _uptime = process.uptime() * 1000
        const u = conn.clockString(_uptime)
        return Buffer.isBuffer(text) ? conn.sendFile(jid, text, 'file', '', quoted, false, options) : conn.sendMessage(jid, { ...options,
        text,
        mentions: conn.parseMention(text),
        contextInfo: {
            forwardingScore: 9999,
            isForwarded: false
        },
        mentions: conn.parseMention(text),
        ...options }, {
            quoted,
            ephemeralExpiration: 86400,
            ...options
        })
    }
    conn.fakeReply = (jid, text = '', fakeJid = conn.user.jid, fakeText = '', fakeGroupJid, options) => {
        return conn.sendMessage(jid, { text: text }, { ephemeralExpiration: 86400, quoted: { key: { fromMe: fakeJid == conn.user.jid, participant: fakeJid, ...(fakeGroupJid ? { remoteJid: fakeGroupJid } : {}) }, message: { conversation: fakeText }, ...options } })
    }
    conn.reply1 = async (jid, text, quoted, men) => {
        return conn.sendMessage(jid, {
            text: text, jpegThumbnail: await (await fetch(thumbr1)).buffer(), mentions: men
        }, { quoted: quoted, ephemeralExpiration: 86400 })
    }
    conn.reply2 = async (jid, text, media, quoted, men) => {
        return conn.sendMessage(jid, {
            text: text, jpegThumbnail: await (await fetch(media)).buffer(), mentions: men
        }, { quoted: quoted, ephemeralExpiration: 8600 })
    }

    /**
    * Send a list message
    * @param jid the id to send to
    * @param button the optional button text, title and description button
    * @param rows the rows of sections list message
    */
    conn.sendListM = async (jid, button, rows, quoted, options = {}) => {
        const sections = [
            {
                title: button.title,
                rows: [...rows]
            }
        ]
        const listMessage = {
            text: button.description,
            footer: button.footerText,
            mentions: await conn.parseMention(button.description),
            ephemeralExpiration: 86400,
            title: '',
            buttonText:button.buttonText,
            sections
        }
        conn.sendMessage(jid, listMessage, {
            quoted,
            ephemeralExpiration: 86400,
            contextInfo: {
                forwardingScore: 999999,
                isForwarded: false,
                mentions: await conn.parseMention(button.description + button.footerText),
                ...options
            }
        })
    }

    // ── HELPER: build nativeFlow interactive message ───────────────────
    conn._buildNativeFlow = async (jid, header, bodyText, footerText, buttons, quoted, options = {}) => {
        let text = ''
        if (bodyText) text += bodyText + '\n\n'
        if (footerText) text += footerText + '\n\n'
        if (buttons && buttons.length) {
            text += '*[ Pilihan ]*\n'
            buttons.forEach((b, idx) => {
                let btnText = b.text || b.displayText || b[0] || ('Opsi ' + (idx+1))
                text += `- ${btnText}\n`
            })
        }
        text = text.trim()

        if (header && header.hasMediaAttachment && header.imageMessage) {
            return await conn.sendMessage(jid, { image: header.imageMessage, caption: text, ...options }, { quoted })
        } else if (header && header.hasMediaAttachment && header.videoMessage) {
            return await conn.sendMessage(jid, { video: header.videoMessage, caption: text, ...options }, { quoted })
        } else if (header && header.hasMediaAttachment && header.documentMessage) {
            return await conn.sendMessage(jid, { document: header.documentMessage, caption: text, ...options }, { quoted })
        }

        return await conn.sendMessage(jid, { text, ...options }, { quoted })
    }

    /**
     * send Button Document — migrated to nativeFlowMessage
     */
    conn.sendButtonDoc = async (jid, content, footerText, button1, id1, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footerText,
            [{ text: button1, id: id1 }], quoted, options)
    }
    conn.send2ButtonDoc = async (jid, content, footerText, button1, id1, button2, id2, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }], quoted, options)
    }
    conn.send2ButtonImgDoc = async (jid, buffer, contentText, footerText, button1, id1, button2, id2, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ image: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }], quoted, options)
    }

    conn.sendButton = async (jid, text, footer, buttons, quoted = null) => {
        const btns = buttons.map(b => ({ text: b[0], id: b[1] }))
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, text, footer, btns, quoted)
    }
    conn.send2Button = async (jid, content, footerText, button1, id1, button2, id2, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }], quoted, options)
    }
    conn.send3Button = async (jid, content, footerText, button1, id1, button2, id2, button3, id3, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }, { text: button3, id: id3 }], quoted, options)
    }

    conn.sendButtonLoc = async (jid, buffer, content, footer, button1, row1, quoted, options = {}) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footer,
            [{ text: button1, id: row1 }], quoted, options)
    }
    conn.send2ButtonLoc = async (jid, buffer, content, footer, button1, row1, button2, row2, quoted, options = {}) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footer,
            [{ text: button1, id: row1 }, { text: button2, id: row2 }], quoted, options)
    }
    conn.send3ButtonLoc = async (jid, buffer, content, footer, button1, row1, button2, row2, button3, row3, quoted, options = {}) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footer,
            [{ text: button1, id: row1 }, { text: button2, id: row2 }, { text: button3, id: row3 }], quoted, options)
    }

    conn.sendButtonImg = async (jid, buffer, contentText, footerText, button1, id1, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ image: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }], quoted, options)
    }
    conn.send2ButtonImg = async (jid, buffer, contentText, footerText, button1, id1, button2, id2, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ image: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }], quoted, options)
    }
    conn.send3ButtonImg = async (jid, buffer, contentText, footerText, button1, id1, button2, id2, button3, id3, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ image: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }, { text: button3, id: id3 }], quoted, options)
    }

    conn.sendButtonVid = async (jid, buffer, contentText, footerText, button1, id1, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ video: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }], quoted, options)
    }
    conn.send2ButtonVid = async (jid, buffer, contentText, footerText, button1, id1, button2, id2, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ video: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }], quoted, options)
    }
    conn.send3ButtonVid = async (jid, buffer, contentText, footerText, button1, id1, button2, id2, button3, id3, quoted, options) => {
        let type = await conn.getFile(buffer)
        let { data: file } = type
        let header
        try {
            const uploaded = await prepareWAMessageMedia({ video: file }, { upload: conn.waUploadToServer })
            header = proto.Message.InteractiveMessage.Header.create({ ...uploaded, hasMediaAttachment: true })
        } catch (_) { header = { hasMediaAttachment: false } }
        return conn._buildNativeFlow(jid, header, contentText, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }, { text: button3, id: id3 }], quoted, options)
    }

    // Template button aliases — all migrated to nativeFlow
    conn.send3TemplateButtonImg = async (jid, buffer, content, footerText, button1, id1, button2, id2, button3, id3, quoted, options) => {
        return conn.send3ButtonImg(jid, buffer, content, footerText, button1, id1, button2, id2, button3, id3, quoted, options)
    }
    conn.sendTemplateButtonDoc = async (jid, buffer, content, footerText, button1, id1, button2, id2, button3, id3, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, content, footerText,
            [{ text: button1, id: id1 }, { text: button2, id: id2 }, { text: button3, id: id3 }], quoted, options)
    }
    conn.sendTemplateButtonLoc = async (jid, buffer, contentText, footer, buttons1, row1, buttons2, row2, buttons3, row3, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, contentText, footer,
            [{ text: buttons1, id: row1 }, { text: buttons2, id: row2 }, { text: buttons3, id: row3 }], quoted, options)
    }
    conn.sendTemplateButtonCopy = async (jid, buffer, contentText, buttons1, row1, footer, quoted, options) => {
        return conn._buildNativeFlow(jid, { hasMediaAttachment: false }, contentText, footer,
            [{ text: buttons1, id: row1 }], quoted, options)
    }
    conn.sendTemplateButtonFakeImg = async (jid, buffer, content, footerText, btn1, id1, options) => {
        return conn.sendButtonImg(jid, buffer, content, footerText, btn1, id1, null, options)
    }
    conn.send2TemplateButtonFakeImg = async (jid, buffer, content, footerText, btn1, id1, btn2, id2, quoted, options) => {
        return conn.send2ButtonImg(jid, buffer, content, footerText, btn1, id1, btn2, id2, quoted, options)
    }
    conn.send3TemplateButtonFakeImg = async (jid, buffer, content, footerText, btn1, id1, btn2, id2, btn3, id3, quoted, options) => {
        return conn.send3ButtonImg(jid, buffer, content, footerText, btn1, id1, btn2, id2, btn3, id3, quoted, options)
    }

    //========== Interactive Buttons (atexovi-baileys) ==========//

    /**
     * Send Call Button (interactiveButtons: cta_call)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} displayText - label tombol
     * @param {String} phoneNumber - nomor telepon (format: 628xxx)
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendCallButton = async (jid, text, displayText, phoneNumber, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            interactiveButtons: [
                {
                    name: 'cta_call',
                    buttonParamsJson: JSON.stringify({
                        display_text: displayText,
                        phone_number: phoneNumber
                    })
                }
            ],
            ...options
        }, { quoted })
    }

    /**
     * Send URL Button (interactiveButtons: cta_url)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} displayText - label tombol
     * @param {String} url - URL tujuan
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendUrlButton = async (jid, text, displayText, url, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            interactiveButtons: [
                {
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: displayText,
                        url: url,
                        merchant_url: url
                    })
                }
            ],
            ...options
        }, { quoted })
    }

    /**
     * Send Quick Reply Button (interactiveButtons: quick_reply)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} title - judul (subtitle)
     * @param {String} displayText - label tombol
     * @param {String} id - id response yang dikirim saat ditekan
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendQuickReplyButton = async (jid, text, title, displayText, id, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            title,
            interactiveButtons: [
                {
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: displayText,
                        id: id
                    })
                }
            ],
            ...options
        }, { quoted })
    }

    /**
     * Send Copy Button (interactiveButtons: cta_copy)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} displayText - label tombol
     * @param {String} copyCode - teks/link yang di-copy saat tombol ditekan
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendCopyButton = async (jid, text, displayText, copyCode, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            interactiveButtons: [
                {
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: displayText,
                        copy_code: copyCode
                    })
                }
            ],
            ...options
        }, { quoted })
    }

    /**
     * Send Interactive Menu (interactiveButtons: single_select / list menu modern)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} subtitle - subtitle pesan (opsional)
     * @param {String} footer - footer pesan (opsional)
     * @param {Array} sections - array sections [{title, rows:[{title, description, id}]}]
     * @param {Object} quoted 
     * @param {Object} options 
     * 
     * Contoh sections:
     * [{ title: 'Menu', rows: [{ title: 'Ping', description: 'Cek bot', id: 'ping' }] }]
     */
    conn.sendInteractiveMenu = async (jid, text, subtitle, footer, sections, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            subtitle,
            footer,
            interactiveButtons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'Pilih Menu',
                        sections: sections
                    })
                }
            ],
            ...options
        }, { quoted })
    }

    /**
     * Send Multiple Interactive Buttons sekaligus (gabungan)
     * @param {String} jid 
     * @param {String} text - teks pesan
     * @param {String} footer - footer (opsional)
     * @param {Array} buttons - array of { name, buttonParamsJson } (format atexovi-baileys)
     * @param {Object} quoted 
     * @param {Object} options 
     */
    conn.sendInteractiveButtons = async (jid, text, footer, buttons, quoted, options = {}) => {
        return await conn.sendMessage(jid, {
            text,
            footer,
            interactiveButtons: buttons,
            ...options
        }, { quoted })
    }

    //========== End Interactive Buttons ==========//

    /**
    * sendGroupV4Invite
    * @param {String} jid 
    * @param {*} participant 
    * @param {String} inviteCode 
    * @param {Number} inviteExpiration 
    * @param {String} groupName 
    * @param {String} caption 
    * @param {*} options 
    * @returns 
    */
    conn.sendGroupV4Invite = async (jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', caption = 'Invitation to join my WhatsApp group', options = {}) => {
        let msg = proto.Message.fromObject({
            groupInviteMessage: proto.GroupInviteMessage.fromObject({
                inviteCode,
                inviteExpiration: parseInt(inviteExpiration) || + new Date(new Date + (3 * 86400000)),
                groupJid: jid,
                groupName: groupName ? groupName : this.getName(jid),
                caption
            })
        })
        let message = await this.prepareMessageFromContent(participant, msg, options)
        await this.relayWAMessage(message)
        return message
    }

    /**
     * nemu
     * Message
     */
    conn.relayWAMessage = async (pesanfull) => {
        if (pesanfull.message.audioMessage) {
            await conn.sendPresenceUpdate('recording', pesanfull.key.remoteJid)
        } else {
            await conn.sendPresenceUpdate('composing', pesanfull.key.remoteJid)
        }
        var mekirim = await conn.relayMessage(pesanfull.key.remoteJid, pesanfull.message, { messageId: pesanfull.key.id })
        conn.ev.emit('messages.upsert', { messages: [pesanfull], type: 'append' });
        return mekirim
    }

    /**
    * cMod
    * @param {String} jid 
    * @param {*} message 
    * @param {String} text 
    * @param {String} sender 
    * @param {*} options 
    * @returns 
    */

    conn.cMod = async (jid, message, text = '', sender = conn.user.jid, options = {}) => {
        if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions]
        let copy = message.toJSON()
        delete copy.message.messageContextInfo
        delete copy.message.senderKeyDistributionMessage
        let mtype = Object.keys(copy.message)[0]
        let msg = copy.message
        let content = msg[mtype]
        if (typeof content === 'string') msg[mtype] = text || content
        else if (content.caption) content.caption = text || content.caption
        else if (content.text) content.text = text || content.text
        if (typeof content !== 'string') {
            msg[mtype] = { ...content, ...options }
            msg[mtype].contextInfo = {
                ...(content.contextInfo || {}),
                mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
            }
        }
        if (copy.participant) sender = copy.participant = sender || copy.participant
        else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
        if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
        else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
        copy.key.remoteJid = jid
        copy.key.fromMe = areJidsSameUser(sender, conn.user.id) || false
        return proto.WebMessageInfo.fromObject(copy)
    }
    /**
     * Exact Copy Forward
     * @param {String} jid
     * @param {Object} message
     * @param {Boolean|Number} forwardingScore
     * @param {Object} options
     */
    conn.copyNForward = async (jid, message, forwardingScore = true, options = {}) => {
        let m = generateForwardMessageContent(message, !!forwardingScore)
        let mtype = Object.keys(m)[0]
        if (forwardingScore && typeof forwardingScore == 'number' && forwardingScore > 1) m[mtype].contextInfo.forwardingScore += forwardingScore
        m = generateWAMessageFromContent(jid, m, { ...options, userJid: conn.user.id })
        await conn.relayMessage(jid, m.message, { messageId: m.key.id, additionalAttributes: { ...options } })
        return m
    }
    /**
     * Download media message
     * @param {Object} m
     * @param {String} type 
     * @param {fs.PathLike|fs.promises.FileHandle} filename
     * @returns {Promise<fs.PathLike|fs.promises.FileHandle|Buffer>}
     */
    conn.downloadM = async (m, type, filename = '') => {
        if (!m || !(m.url || m.directPath)) return Buffer.alloc(0)
        const stream = await downloadContentFromMessage(m, type)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        if (filename) await fs.promises.writeFile(filename, buffer)
        return filename && fs.existsSync(filename) ? filename : buffer
    }
    /**
     * By Fokus ID
     * @param {*} message 
     * @param {*} filename 
     * @param {*} attachExtension 
     * @returns 
     */
    conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(quoted, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
    let type = await FileType.fromBuffer(buffer)
        trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
        // save to file
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
    }

    /**
     * Read message
     * @param {String} jid 
     * @param {String|undefined|null} participant 
     * @param {String} messageID 
     */
    conn.chatRead = async (jid, participant, messageID) => {
        return await conn.sendReadReceipt(jid, participant, [messageID])
    }

    /**
     * Parses string into mentionedJid(s)
     * @param {String} text
     */
    conn.parseMention = async (text = '') => {
        return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
    }

    conn.sendStimg = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
    }

    conn.sendStvid = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifVid(buff, options)
        } else {
            buffer = await videoToWebp(buff)
        }
        await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
    }

    conn.saveName = async (id, name = '') => {
        if (!id) return
        id = conn.decodeJid(id)
        let isGroup = id.endsWith('@g.us')
        if (id in conn.contacts && conn.contacts[id][isGroup ? 'subject' : 'name'] && id in conn.chats) return
        let metadata = {}
        if (isGroup) metadata = await conn.groupMetadata(id)
        let chat = { ...(conn.contacts[id] || {}), id, ...(isGroup ? { subject: metadata.subject, desc: metadata.desc } : { name }) }
        conn.contacts[id] = chat
        conn.chats[id] = chat
    }

    /**
     * Get name from jid
     * @param {String} jid
     * @param {Boolean} withoutContact
     */
    conn.getName = (jid = '', withoutContact = false) => {
        jid = conn.decodeJid(jid)
        withoutContact = conn.withoutContact || withoutContact
        let v
        if (jid.endsWith('@g.us')) return new Promise(async (resolve) => {
            v = conn.chats[jid] || {}
            if (!(v.name || v.subject)) v = await conn.groupMetadata(jid) || {}
            resolve(v.name || v.subject || (()=>{try{return PhoneNumber('+'+jid.replace('@s.whatsapp.net','').split(':')[0]).getNumber('international')||jid}catch(_){return jid}})())
        })
        else v = jid === '0@s.whatsapp.net' ? {
            jid,
            vname: 'WhatsApp'
        } : areJidsSameUser(jid, conn.user.id) ?
            conn.user :
            (conn.chats[jid] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || (()=>{try{return PhoneNumber('+'+jid.replace('@s.whatsapp.net','').split(':')[0]).getNumber('international')||jid}catch(_){return jid}})()
    }

    conn.processMessageStubType = async(m) => {
    /**
     * to process MessageStubType
     * @param {import('@whiskeysockets/baileys').proto.WebMessageInfo} m 
     */
    if (!m.messageStubType) return
        const chat = conn.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '')
    if (!chat || chat === 'status@broadcast') return
        const emitGroupUpdate = (update) => {
            conn.ev.emit('groups.update', [{ id: chat, ...update }])
        }
        switch (m.messageStubType) {
            case WAMessageStubType.REVOKE:
            case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
            emitGroupUpdate({ revoke: m.messageStubParameters[0] })
            break
            case WAMessageStubType.GROUP_CHANGE_ICON:
            emitGroupUpdate({ icon: m.messageStubParameters[0] })
            break
            default: {
                if (process.env.DEBUG_MESSAGE_STUB === 'true') {
                    console.log({
                        messageStubType: m.messageStubType,
                        messageStubParameters: m.messageStubParameters,
                        type: WAMessageStubType[m.messageStubType]
                    })
                }
                break
            }
        }
        const isGroup = chat.endsWith('@g.us')
        if (!isGroup) return
        let chats = conn.chats[chat]
        if (!chats) chats = conn.chats[chat] = { id: chat }
        chats.isChats = true
        const metadata = await conn.groupMetadata(chat).catch(_ => null)
        if (!metadata) return
        chats.subject = metadata.subject
        chats.metadata = metadata
        // Simpan mapping LID → SWA dari semua participant
        if (metadata.participants) conn.saveLidMapping(metadata.participants)
    }
    conn.insertAllGroup = async() => {
        const groups = await conn.groupFetchAllParticipating().catch(_ => null) || {}
        let totalMapped = 0
        for (const group in groups) {
            conn.chats[group] = { ...(conn.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
            // Simpan mapping LID semua grup
            if (groups[group].participants) {
                const beforeCount = Object.keys(global.db?.data?.settings?.lidMap || {}).length
                conn.saveLidMapping(groups[group].participants)
                const afterCount = Object.keys(global.db?.data?.settings?.lidMap || {}).length
                totalMapped += (afterCount - beforeCount)
            }
        }
        if (totalMapped > 0) {
            console.log(`[LID SYNC] insertAllGroup selesai — ${totalMapped} mapping baru`)
            global.db.write().catch(() => {})
        }
        return conn.chats
    }
    conn.pushMessage = async(m) => {
    /**
     * pushMessage
     * @param {import('@whiskeysockets/baileys').proto.WebMessageInfo[]} m 
     */
    if (!m) return
        if (!Array.isArray(m)) m = [m]
            for (const message of m) {
                try {
                // if (!(message instanceof proto.WebMessageInfo)) continue // https://github.com/adiwajshing/Baileys/pull/696/commits/6a2cb5a4139d8eb0a75c4c4ea7ed52adc0aec20f
                if (!message) continue
                    if (message.messageStubType && message.messageStubType != WAMessageStubType.CIPHERTEXT) conn.processMessageStubType(message).catch(console.error)
                        const _mtype = Object.keys(message.message || {})
                    const mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(_mtype[0]) && _mtype[0]) ||
                    (_mtype.length >= 3 && _mtype[1] !== 'messageContextInfo' && _mtype[1]) ||
                    _mtype[_mtype.length - 1]
                    const chat = conn.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '')
                    if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
                    /**
                     * @type {import('@whiskeysockets/baileys').proto.IContextInfo}
                     */
                    let context = message.message[mtype].contextInfo
                    let participant = conn.decodeJid(context.participant)
                    const remoteJid = conn.decodeJid(context.remoteJid || participant)
                    /**
                     * @type {import('@whiskeysockets/baileys').proto.IMessage}
                     * 
                     */
                    let quoted = message.message[mtype].contextInfo.quotedMessage
                    if ((remoteJid && remoteJid !== 'status@broadcast') && quoted) {
                        let qMtype = Object.keys(quoted)[0]
                        if (qMtype == 'conversation') {
                            quoted.extendedTextMessage = { text: quoted[qMtype] }
                            delete quoted.conversation
                            qMtype = 'extendedTextMessage'
                        }

                        if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {}
                        quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || []
                        const isGroup = remoteJid.endsWith('g.us')
                        if (isGroup && !participant) participant = remoteJid
                            const qM = {
                                key: {
                                    remoteJid,
                                    fromMe: areJidsSameUser(conn.user.jid, remoteJid),
                                    id: context.stanzaId,
                                    participant,
                                },
                                message: quoted,
                                ...(isGroup ? { participant } : {})
                            }
                            let qChats = conn.chats[participant]
                            if (!qChats) qChats = conn.chats[participant] = { id: participant, isChats: !isGroup }
                                if (!qChats.messages) qChats.messages = {}
                                    if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM
                                        let qKeys = Object.keys(qChats.messages)
                                        if (qKeys.length > 40) {
                                            for (let k of qKeys.slice(0, qKeys.length - 30)) delete qChats.messages[k]
                                        }
                                    }
                            }
                            if (!chat || chat === 'status@broadcast') continue
                                const isGroup = chat.endsWith('@g.us')
                            let chats = conn.chats[chat]
                            if (!chats) {
                                if (isGroup) await conn.insertAllGroup().catch(console.error)
                                    chats = conn.chats[chat] = { id: chat, isChats: true, ...(conn.chats[chat] || {}) }
                            }
                            let metadata, sender
                            if (isGroup) {
                                if (!chats.subject || !chats.metadata) {
                                    metadata = await conn.groupMetadata(chat).catch(_ => ({})) || {}
                                    if (!chats.subject) chats.subject = metadata.subject || ''
                                    if (!chats.metadata) chats.metadata = metadata
                                }
                            sender = conn.decodeJid(message.key?.fromMe && conn.user.id || message.participant || message.key?.participant || chat || '')
                            if (sender !== chat) {
                                let chats = conn.chats[sender]
                                if (!chats) chats = conn.chats[sender] = { id: sender }
                                if (!chats.name) chats.name = message.pushName || chats.name || ''
                            }
                    } else if (!chats.name) chats.name = message.pushName || chats.name || ''
                    if (['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype)) continue
                        chats.isChats = true
                    if (!chats.messages) chats.messages = {}
                        const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, conn.user.id)
                    if (!['protocolMessage'].includes(mtype) && !fromMe && message.messageStubType != WAMessageStubType.CIPHERTEXT && message.message) {
                        delete message.message.messageContextInfo
                        delete message.message.senderKeyDistributionMessage
                        chats.messages[message.key.id] = message
                        let keys = Object.keys(chats.messages)
                        if (keys.length > 40) {
                            for (let k of keys.slice(0, keys.length - 30)) delete chats.messages[k]
                        }
                    }
            } catch (e) {
                console.error('[simple.pushMessage]', e?.message || String(e))
            }
        }
    }

    /**
     * ms to date
     * @param {String} ms
     */
    conn.msToDate = (ms) => {
      let days = Math.floor(ms / (24 * 60 * 60 * 1000));
      let daysms = ms % (24 * 60 * 60 * 1000);
      let hours = Math.floor((daysms) / (60 * 60 * 1000));
      let hoursms = ms % (60 * 60 * 1000);
      let minutes = Math.floor((hoursms) / (60 * 1000));
      let minutesms = ms % (60 * 1000);
      let sec = Math.floor((minutesms) / (1000));
      return days + " Hari " + hours + " Jam " + minutes + " Menit";
      // +minutes+":"+sec;
    }

    /**
     * merge arrays
     * @param {Array} arr
     */
    conn.join = (arr) => {
        let construct = []
        for (let i = 0; i < arr.length; i++) {
            construct = construct.concat(arr[i])
        }
        return construct
    }

    /**
     * 
     * @param {Array} list 
     * @returns 
     */
    conn.pickRandom = (list) => {
        return list[Math.floor(list.length * Math.random())]
    }

    /**
     * 
     * @param {Number} ms 
     * @returns 
     */
    conn.delay = (ms) => {
        return new Promise((resolve, reject) => setTimeout(resolve, ms))
    }

    /**
     * 
     * @param {String} text 
     * @returns 
     */
    conn.filter = (text) => {
      let mati = ["q", "w", "r", "t", "y", "p", "s", "d", "f", "g", "h", "j", "k", "l", "z", "x", "c", "v", "b", "n", "m"]
      if (/[aiueo][aiueo]([qwrtypsdfghjklzxcvbnm])?$/i.test(text)) return text.substring(text.length - 1)
      else {
        let res = Array.from(text).filter(v => mati.includes(v))
        let resu = res[res.length - 1]
        for (let huruf of mati) {
            if (text.endsWith(huruf)) {
                resu = res[res.length - 2]
            }
        }
        let misah = text.split(resu)
        return resu + misah[misah.length - 1]
      }
    }

    /**
     * 
     * @param  {...any} args 
     * @returns 
     */
    conn.format = (...args) => {
        return util.format(...args)
    }

    /**
     * 
     * @param {String} url 
     * @param {Object} options 
     * @returns 
     */
    conn.getBuffer = async (url, options) => {
        try {
            options ? options : {}
            const res = await axios({
                method: "get",
                url,
                headers: {
                    'DNT': 1,
                    'Upgrade-Insecure-Request': 1
                },
                ...options,
                responseType: 'arraybuffer'
            })
            return res.data
        } catch (e) {
            console.log(`Error : ${e}`)
        }
    }

    /**
     * 
     * @param {Number} ms 
     * @returns 
     */
    conn.clockString = (ms) => {
        let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
        let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
        let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
        return [h, m, s].map(v => v.toString().padStart(2, 0)).join(':')
    }

    /**
     * Serialize Message, so it easier to manipulate
     * @param {Object} m
     */
    conn.serializeM = (m) => {
        return exports.smsg(conn, m)
    }

    // [REMOVED: obfuscated third-party backdoor code]

    Object.defineProperty(conn, 'name', {
        value: { ...(options.chats || {}) },
        configurable: true,
    })
    if (conn.user?.id) conn.user.jid = conn.decodeJid(conn.user.id)
    if (store) store.bind(conn.ev)
    return conn
}
/**
 * Serialize Message
 * @param {WAConnection} conn 
 * @param {Object} m 
 * @param {Boolean} hasParent 
 */
exports.smsg = (conn, m, hasParent) => {
    if (!m) return m
    let M = proto.WebMessageInfo
    m = M.fromObject(m)
    if (m.key) {
        m.id = m.key.id
        // Pesan internal/client-generated dari Baileys umumnya punya prefix khusus.
        // Jangan tandai semua id length=16 sebagai Baileys karena itu bisa membuat
        // pesan user biasa ikut dibuang sebelum command parser jalan.
        m.isBaileys = !!(m.id && (
            m.id.startsWith('BAE5') ||
            (m.id.startsWith('3EB0') && m.id.length === 12)
        ))
        m.chat = conn.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '')
        m.isGroup = m.chat.endsWith('@g.us')

        // ── MIGRATED: Sender resolution via shiraori-baileys extractPhoneNumber ──
        // FIXED v2: deteksi plain LID (20143849627780) selain @lid format
        {
            const _rawSenderField = m.key.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || ''
            m.sender = conn.decodeJid(_rawSenderField)
        }

        // Deteksi LID — 2 bentuk:
        // (A) "xxx@lid" — format standar
        // (B) "20143849627780" — plain LID number (≥11 digit, bukan 62xxx)
        //     WA kadang kirim m.key.participant tanpa @lid suffix sama sekali
        {
            const _sNum = m.sender && m.sender.includes('@') ? m.sender.split('@')[0].split(':')[0] : m.sender
            const _isPlainLidSender = m.sender && !m.sender.includes('@')
                && /^\d{11,}$/.test(m.sender)
                && !/^62\d{7,}$/.test(m.sender)
            // Normalize plain LID ke @lid format agar blok resolve di bawah berjalan
            if (_isPlainLidSender) {
                m.sender = m.sender + '@lid'
            }
        }

        if (m.sender && m.sender.endsWith('@lid')) {
            const _rawLid = m.sender
            let resolvedSender = null

            // PRIORITAS 1: extractPhoneNumberFromMessage dari shiraori-baileys
            // Menggabungkan semua field sekaligus (participant + key.participant + remoteJid)
            try {
                const _extractedNum = extractPhoneNumberFromMessage({
                    key: {
                        remoteJid  : m.key.remoteJid,
                        participant: m.key.participant,
                        fromMe     : m.key.fromMe,
                    },
                    participant: m.participant,
                })
                if (_extractedNum && /^\d{8,15}$/.test(_extractedNum)) {
                    // Pastikan bukan LID number itu sendiri
                    if (_extractedNum !== _rawLid.split('@')[0]) {
                        resolvedSender = _extractedNum
                        _saveLidMap(_rawLid, _extractedNum)
                    }
                }
            } catch (_) {}

            // PRIORITAS 2: senderPn (field langsung dari WA)
            if (!resolvedSender) {
                try {
                    const _pn = m.key?.senderPn || m.key?.sn || m.key?.pn
                    if (_pn && typeof _pn === 'string') {
                        const _pnNum = _pn.replace(/[^0-9]/g, '')
                        if (/^\d{8,15}$/.test(_pnNum)) {
                            resolvedSender = _pnNum
                            _saveLidMap(_rawLid, _pnNum)
                        }
                    }
                } catch (_) {}
            }

            // PRIORITAS 3: resolveLid (lidMap cache + conn.chats metadata)
            if (!resolvedSender) {
                try {
                    const _r = conn.resolveLid(_rawLid, m.chat)
                    if (_r && _r !== _rawLid && !_r.endsWith('@lid')) {
                        const _rNum = extractPhoneNumber(_r) // shiraori-baileys
                        if (/^\d{8,15}$/.test(_rNum)) resolvedSender = _rNum
                    }
                } catch (_) {}
            }

            // PRIORITAS 4: conn.contacts[lid]
            if (!resolvedSender) {
                try {
                    const _c = conn.contacts?.[_rawLid]
                    if (_c?.id && !isLidJid(_c.id)) {
                        const _cNum = extractPhoneNumber(_c.id) // shiraori-baileys
                        if (/^\d{8,15}$/.test(_cNum)) {
                            resolvedSender = _cNum
                            _saveLidMap(_rawLid, _cNum)
                        }
                    }
                } catch (_) {}
            }

            // PRIORITAS 5: DM — sender pasti = m.chat
            if (!resolvedSender && !m.isGroup && m.chat?.endsWith('@s.whatsapp.net')) {
                try {
                    const _chatNum = extractPhoneNumber(m.chat) // shiraori-baileys
                    if (/^\d{8,15}$/.test(_chatNum)) {
                        resolvedSender = _chatNum
                        _saveLidMap(_rawLid, _chatNum)
                    }
                } catch (_) {}
            }

            if (resolvedSender) {
                m.sender = resolvedSender
            } else {
                // Fallback ke angka LID mentah (lebih baik dari "@lid" yang error di everywhere)
                const _lidNum = _rawLid.split('@')[0]
                if (/^\d{6,}$/.test(_lidNum)) m.sender = _lidNum
            }
        }

        // Helper internal: simpan LID → nomor WA ke lidMap
        function _saveLidMap(lid, num) {
            try {
                if (!global.db?.data?.settings) return
                if (!global.db.data.settings.lidMap) global.db.data.settings.lidMap = {}
                if (global.db.data.settings.lidMap[lid] === num) return
                global.db.data.settings.lidMap[lid] = num
                global.db.write().catch(() => {})
            } catch (_) {}
        }

        // m.fromMe: pakai m.key.fromMe sebagai primary; areJidsSameUser sebagai fallback
        m.fromMe = m.key.fromMe || (
            m.sender && conn.user?.id && !m.sender.includes('@')
                ? false  // plain number (LID fallback) — bukan fromMe
                : areJidsSameUser(m.sender, conn.user.id)
        )
    }
    if (m.message) {
        let mtype = Object.keys(m.message)
        m.mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype[0]) && mtype[0]) || // Sometimes message in the front
            (mtype.length >= 3 && mtype[1] !== 'messageContextInfo' && mtype[1]) || // Sometimes message in midle if mtype length is greater than or equal to 3!
            mtype[mtype.length - 1] // common case
        m.msg = m.message[m.mtype]
        if (m.chat == 'status@broadcast' && ['protocolMessage', 'senderKeyDistributionMessage'].includes(m.mtype)) m.chat = (m.key.remoteJid !== 'status@broadcast' && m.key.remoteJid) || m.sender
        if (m.mtype == 'protocolMessage' && m.msg.key) {
            if (m.msg.key.remoteJid == 'status@broadcast') m.msg.key.remoteJid = m.chat
            if (!m.msg.key.participant || m.msg.key.participant == 'status_me') m.msg.key.participant = m.sender
            m.msg.key.fromMe = conn.decodeJid(m.msg.key.participant) === conn.decodeJid(conn.user.id)
            if (!m.msg.key.fromMe && m.msg.key.remoteJid === conn.decodeJid(conn.user.id)) m.msg.key.remoteJid = m.sender
        }
        m.text = m.msg.text || m.msg.caption || m.msg.contentText || m.msg || ''
        if (typeof m.text !== 'string') {
            if ([
                'protocolMessage',
                'messageContextInfo',
                'stickerMessage',
                'audioMessage',
                'senderKeyDistributionMessage'
            ].includes(m.mtype)) m.text = ''
            else m.text = m.text.selectedDisplayText || m.text.hydratedTemplate?.hydratedContentText || m.text
        }
        // =============================================
        // Parsing semua tipe button response
        // =============================================
        try {
            const _getPrefix = () => (global.prefix instanceof RegExp ? '.' : Array.isArray(global.prefix) ? global.prefix[0] : global.prefix) || '.'
            const _injectPrefix = (id) => {
                const pfx = _getPrefix()
                return id.startsWith(pfx) ? id : pfx + id
            }

            // 1. templateButtonReplyMessage (atexovi-baileys - yang dipakai saat ini)
            if (m.mtype === 'templateButtonReplyMessage') {
                // Beberapa versi kirim di selectedId, beberapa di selectedDisplayText
                const btnId = m.msg?.selectedId || m.msg?.selectedDisplayText || ''
                if (btnId) {
                    m.text = _injectPrefix(btnId)
                    m.interactiveId = btnId
                }
            }
            // 2. interactiveResponseMessage (nativeFlow - atexovi-baileys versi baru)
            else if (m.mtype === 'interactiveResponseMessage') {
                // Coba berbagai path yang dipakai versi baileys berbeda
                let btnId = ''

                // Path 1: nativeFlowResponseMessage.paramsJson (paling umum)
                try {
                    const paramsJson = m.msg?.nativeFlowResponseMessage?.paramsJson || ''
                    if (paramsJson) {
                        const parsed = typeof paramsJson === 'string' ? JSON.parse(paramsJson) : paramsJson
                        btnId = parsed?.id || parsed?.display_text || ''
                    }
                } catch (_) {}

                // Path 2: response langsung (beberapa versi WA kirim id di sini)
                if (!btnId) {
                    try {
                        btnId = m.msg?.response || ''
                    } catch (_) {}
                }

                // Path 3: nativeFlowResponseMessage.name sebagai fallback command
                if (!btnId) {
                    try {
                        const name = m.msg?.nativeFlowResponseMessage?.name || ''
                        if (name) btnId = name
                    } catch (_) {}
                }

                if (btnId) {
                    m.text = _injectPrefix(btnId)
                    m.interactiveId = btnId
                }
            }
            // 3. listResponseMessage
            else if (m.mtype === 'listResponseMessage') {
                const rowId = m.msg?.singleSelectReply?.selectedRowId || ''
                if (rowId) {
                    m.text = _injectPrefix(rowId)
                    m.interactiveId = rowId
                }
            }
            // 4. buttonsResponseMessage (baileys lama)
            else if (m.mtype === 'buttonsResponseMessage') {
                const btnId = m.msg?.selectedButtonId || ''
                if (btnId) {
                    m.text = _injectPrefix(btnId)
                    m.interactiveId = btnId
                }
            }
        } catch (_) {}
        // Resolve @lid di mentionedJid ke @s.whatsapp.net (WA Business kirim @lid)
        let rawMentioned = m.msg?.contextInfo?.mentionedJid || []
        m.mentionedJid = rawMentioned.map(jid => {
            if (jid.endsWith('@lid')) {
                // Cari di lidMap DB
                try {
                    const lidMap = global.db?.data?.settings?.lidMap
                    if (lidMap && lidMap[jid]) return lidMap[jid]
                } catch (_) {}
                // Cari di participant grup
                try {
                    const meta = m.isGroup && conn.chats[m.chat]?.metadata
                    if (meta?.participants) {
                        const p = meta.participants.find(p => p.lid && conn.decodeJid(p.lid) === jid)
                        if (p?.id) return conn.decodeJid(p.id)
                    }
                } catch (_) {}
            }
            return jid
        })
        let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage ? m.msg.contextInfo.quotedMessage : null
        if (m.quoted) {
            let type = Object.keys(m.quoted)[0]
            m.quoted = m.quoted[type]
            if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }
            m.quoted.mtype = type
            m.quoted.id = m.msg.contextInfo.stanzaId
            m.quoted.chat = conn.decodeJid(m.msg.contextInfo.remoteJid || m.chat || m.sender)
            m.quoted.isBaileys = m.quoted.id && m.quoted.id.length === 16 || false
            // MIGRATED: quoted sender resolution pakai extractPhoneNumber (shiraori-baileys)
            m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant)
            if (m.quoted.sender && m.quoted.sender.endsWith('@lid')) {
                const _qRawLid = m.quoted.sender
                let _qResolved = null

                // 1. extractPhoneNumber dari key contextInfo
                try {
                    const _qNum = extractPhoneNumberFromKey({
                        remoteJid  : m.quoted.chat,
                        participant: m.msg.contextInfo.participant,
                    })
                    if (_qNum && /^\d{8,15}$/.test(_qNum) && _qNum !== _qRawLid.split('@')[0]) {
                        _qResolved = _qNum
                    }
                } catch (_) {}

                // 2. resolveLid fallback
                if (!_qResolved) {
                    const _r = conn.resolveLid(_qRawLid, m.quoted.chat)
                    if (_r && _r !== _qRawLid && !_r.endsWith('@lid')) {
                        const _rNum = extractPhoneNumber(_r)
                        if (/^\d{8,15}$/.test(_rNum)) _qResolved = _rNum
                    }
                }

                if (_qResolved) {
                    m.quoted.sender = _qResolved
                } else {
                    const _qLidNum = _qRawLid.split('@')[0]
                    if (/^\d{6,}$/.test(_qLidNum)) m.quoted.sender = _qLidNum
                }
            }
            m.quoted.fromMe = m.quoted.sender === conn.user.jid
            m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.contentText || ''
            m.quoted.name = conn.getName(m.quoted.sender)
            m.quoted.mentionedJid = m.quoted.contextInfo?.mentionedJid?.length && m.quoted.contextInfo.mentionedJid || []
            let vM = m.quoted.fakeObj = M.fromObject({
                key: {
                    fromMe: m.quoted.fromMe,
                    remoteJid: m.quoted.chat,
                    id: m.quoted.id
                },
                message: quoted,
                ...(m.isGroup ? { participant: m.quoted.sender } : {})
            })
            m.getQuotedObj = m.getQuotedMessage = async () => {
                if (!m.quoted.id) return null
                let q = M.fromObject(await conn.loadMessage(m.quoted.id) || vM)
                return exports.smsg(conn, q)
            }
            if (m.quoted.url || m.quoted.directPath) m.quoted.download = (saveToFile = false) => conn.downloadM(m.quoted, m.quoted.mtype.replace(/message/i, ''), saveToFile)
            
            /**
             * Reply to quoted message
             * @param {String|Object} text
             * @param {String|false} chatId
             * @param {Object} options
             */
            m.quoted.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, vM, options)

            /**
             * Copy quoted message
             */
            m.quoted.copy = () => exports.smsg(conn, M.fromObject(M.toObject(vM)))

            /**
             * Forward Quoted Message
             * @param {String} jid
             * @param {Boolean} forceForward
             */
            m.quoted.forward = (jid, forceForward = false) => conn.forwardMessage(jid, vM, forceForward)

            /**
             * Exact Forward quoted message
             * @param {String} jid
             * @param {Boolean|Number} forceForward
             * @param {Object} options
            */
            m.quoted.copyNForward = (jid, forceForward = true, options = {}) => conn.copyNForward(jid, vM, forceForward, options)

            /**
             * Modify quoted Message
             * @param {String} jid
             * @param {String} tex
             * @param {String} sender
             * @param {Object} options
             */
            m.quoted.cMod = (jid, text = '', sender = m.quoted.sender, options = {}) => conn.cMod(jid, vM, text, sender, options)

            /**
             * Delete quoted message
             */
            m.quoted.delete = () => conn.sendMessage(m.quoted.chat, { delete: vM.key })
        }
    }
    m.name = !nullish(m.pushName) && m.pushName || conn.getName(m.sender)
    if (m.msg && m.msg.url) m.download = (saveToFile = false) => conn.downloadM(m.msg, m.mtype.replace(/message/i, ''), saveToFile)

    /**
     * Reply to this message
     * @param {String|Object} text
     * @param {String|false} chatId
     * @param {Object} options
     */
    m.reply = (text, chatId, options) => conn.reply(chatId ? chatId : m.chat, text, m, options)
    
    conn.sendStimg = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
    }
    
    conn.sendStvid = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifVid(buff, options)
        } else {
            buffer = await videoToWebp(buff)
        }
        await conn.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
    }

    /**
     * Exact Forward this message
     * @param {String} jid
     * @param {Boolean} forceForward
     * @param {Object} options
     */
    m.copyNForward = (jid = m.chat, forceForward = true, options = {}) => conn.copyNForward(jid, m, forceForward, options)

    /**
     * Modify this Message
     * @param {String} jid 
     * @param {String} text 
     * @param {String} sender 
     * @param {Object} options 
     */
    m.cMod = (jid, text = '', sender = m.sender, options = {}) => conn.cMod(jid, m, text, sender, options)

    /**
     * Delete this message
     */
    m.delete = () => conn.sendMessage(m.chat, { delete: m.key })
    try {
        conn.saveName(m.sender, m.name)
        conn.pushMessage(m)
        if (m.isGroup) conn.saveName(m.chat)
        if (m.msg && m.mtype == 'protocolMessage') conn.ev.emit('message.delete', m.msg.key)
    } catch (e) {
        console.error(e)
    }
    return m
}

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length')
    for (let i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i]
    return null
}

exports.protoType = () => {
  Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
    const ab = new ArrayBuffer(this.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < this.length; ++i) {
        view[i] = this[i];
    }
    return ab;
  }
  /**
   * @returns {ArrayBuffer}
   */
  Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
    return this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength)
  }
  /**
   * @returns {Buffer}
   */
  ArrayBuffer.prototype.toBuffer = function toBuffer() {
    return Buffer.from(new Uint8Array(this))
  }
  // /**
  //  * @returns {String}
  //  */
  // Buffer.prototype.toUtilFormat = ArrayBuffer.prototype.toUtilFormat = Object.prototype.toUtilFormat = Array.prototype.toUtilFormat = function toUtilFormat() {
  //     return util.format(this)
  // }
  Uint8Array.prototype.getFileType = ArrayBuffer.prototype.getFileType = Buffer.prototype.getFileType = async function getFileType() {
    return await fileTypeFromBuffer(this)
  }
  /**
   * @returns {Boolean}
   */
  String.prototype.isNumber = Number.prototype.isNumber = isNumber
  /**
   *
   * @returns {String}
   */
  String.prototype.capitalize = function capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1, this.length)
  }
  /**
   * @returns {String}
   */
  String.prototype.capitalizeV2 = function capitalizeV2() {
    const str = this.split(' ')
    return str.map(v => v.capitalize()).join(' ')
  }
  String.prototype.decodeJid = function decodeJid() {
    if (/:\d+@/gi.test(this)) {
      const decode = jidDecode(this) || {}
      return (decode.user && decode.server && decode.user + '@' + decode.server || this).trim()
    } else return this.trim()
  }
  /**
   * number must be milliseconds
   * @returns {string}
   */
  Number.prototype.toTimeString = function toTimeString() {
    // const milliseconds = this % 1000
    const seconds = Math.floor((this / 1000) % 60)
    const minutes = Math.floor((this / (60 * 1000)) % 60)
    const hours = Math.floor((this / (60 * 60 * 1000)) % 24)
    const days = Math.floor((this / (24 * 60 * 60 * 1000)))
    return (
      (days ? `${days} day(s) ` : '') +
      (hours ? `${hours} hour(s) ` : '') +
      (minutes ? `${minutes} minute(s) ` : '') +
      (seconds ? `${seconds} second(s)` : '')
    ).trim()
  }
  Number.prototype.getRandom = String.prototype.getRandom = Array.prototype.getRandom = getRandom
}

function isNumber() {
  const int = parseInt(this)
  return typeof int === 'number' && !isNaN(int)
}

function getRandom() {
  if (Array.isArray(this) || this instanceof String) return this[Math.floor(Math.random() * this.length)]
  return Math.floor(Math.random() * this)
}

/**
 * ??
 * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Nullish_coalescing_operator
 * @returns {boolean}
 */
function nullish(args) {
  return !(args !== null && args !== undefined)
}

global.copy = 'https://www.whatsapp.com/otp/copy/'
// ── atexovi-baileys: compatible import pattern ─────────────────────────────────
const _baileysPro = require('@whiskeysockets/baileys')
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

    conn.loadMessage = (messageID) => {
      return Object.entries(conn.chats)
      .filter(([_, { messages }]) => typeof messages === 'object')
      .find(([_, { messages }]) => Object.entries(messages)
      .find(([k, v]) => (k === messageID || v.key?.id === messageID)))
      ?.[1].messages?.[messageID]
    }

    conn.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }
    if (conn.user && conn.user.id) conn.user.jid = conn.decodeJid(conn.user.id)
    conn.chats = {}
    conn.contacts = {}

    // ── Resolve LID → @s.whatsapp.net dari participant grup ──────────────
    // WA Business kirim mentionedJid sebagai @lid, fungsi ini resolve ke nomor asli
    conn.resolveLid = function(lid, groupId) {
        if (!lid || !lid.endsWith('@lid')) return lid
        // Cari di participant grup
        try {
            const meta = groupId && conn.chats[groupId]?.metadata
            if (meta?.participants) {
                const found = meta.participants.find(p => p.lid && conn.decodeJid(p.lid) === lid)
                if (found?.id) return conn.decodeJid(found.id)
            }
        } catch (_) {}
        // Cari di contacts
        try {
            for (const [jid, contact] of Object.entries(conn.contacts)) {
                if (contact.lid === lid) return jid
            }
        } catch (_) {}
        // Cari di lidMap DB (value = nomor HP)
        try {
            const lidMap = global.db?.data?.settings?.lidMap
            if (lidMap?.[lid]) {
                const mapped = lidMap[lid]
                // Kembalikan @s.whatsapp.net untuk keperluan WA API
                return mapped.includes('@') ? mapped : mapped + '@s.whatsapp.net'
            }
        } catch (_) {}
        return lid // fallback kembalikan lid asli
    }

    // Simpan mapping lid → swa dari participant saat join/update grup
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

                // Ambil swa (nomor WA) dari p.id atau p.jid
                let swa = null
                if (typeof p.id === 'string' && p.id) swa = p.id
                else if (typeof p.jid === 'string' && p.jid) swa = p.jid

                if (!lid || !swa) continue
                if (lid === swa) continue
                if (!lid.endsWith('@lid')) continue
                if (!swa.endsWith('@s.whatsapp.net')) continue

                const swaNum = swa.split('@')[0].split(':')[0]  // nomor HP saja
                const isNew = !global.db.data.settings.lidMap[lid]
                global.db.data.settings.lidMap[lid] = swaNum

                console.log('[LID MAP]', lid, '→', swa, isNew ? '(baru)' : '(update)')

                // Kalau mapping baru dan user sudah daftar, kirim notif ke log grup
                if (isNew) {
                    const users = global.db.data?.users || {}
                    const userData = users[swa] || users[lid]
                    if (userData?.registered) {
                        const lidNum = lid.split('@')[0]
                        const swaNum = swa.split('@')[0].split(':')[0]
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
        const nativeButtons = buttons.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: b.text || b.displayText || b[0], id: b.id || b[1] || b.text })
        }))
        const interactiveMessage = proto.Message.InteractiveMessage.create({
            header: header || { hasMediaAttachment: false },
            body: { text: bodyText || '' },
            footer: { text: footerText || '' },
            nativeFlowMessage: { buttons: nativeButtons },
        })
        const msg = generateWAMessageFromContent(
            jid,
            {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                        interactiveMessage,
                    },
                },
            },
            { userJid: conn.user?.id, quoted }
        )
        return await conn.relayMessage(jid, msg.message, { messageId: msg.key.id })
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
        for (const group in groups) {
            conn.chats[group] = { ...(conn.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
            // Simpan mapping LID semua grup
            if (groups[group].participants) conn.saveLidMapping(groups[group].participants)
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
                                message: JSON.parse(JSON.stringify(quoted)),
                                ...(isGroup ? { participant } : {})
                            }
                            let qChats = conn.chats[participant]
                            if (!qChats) qChats = conn.chats[participant] = { id: participant, isChats: !isGroup }
                                if (!qChats.messages) qChats.messages = {}
                                    if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM
                                        let qChatsMessages
                                        if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length)) // maybe avoid memory leak
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
                        chats.messages[message.key.id] = JSON.parse(JSON.stringify(message, null, 2))
                        let chatsMessages
                        if ((chatsMessages = Object.entries(chats.messages)).length > 40) chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length))
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
        m.sender = conn.decodeJid(m.key.fromMe && conn.user.id || m.participant || m.key.participant || m.chat || '')
        if (m.sender.endsWith('@lid')) {
            const resolvedSender = conn.resolveLid(m.sender, m.chat)
            if (resolvedSender && resolvedSender !== m.sender) {
                m.sender = conn.decodeJid(resolvedSender)
            }
        }
        m.fromMe = m.key.fromMe || areJidsSameUser(m.sender, conn.user.id)
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
                const btnId = m.msg?.selectedId || ''
                if (btnId) {
                    m.text = _injectPrefix(btnId)
                    m.interactiveId = btnId
                }
            }
            // 2. interactiveResponseMessage (nativeFlow - atexovi-baileys versi baru)
            else if (m.mtype === 'interactiveResponseMessage') {
                const paramsJson = m.msg?.nativeFlowResponseMessage?.paramsJson || ''
                if (paramsJson) {
                    const parsed = JSON.parse(paramsJson)
                    const btnId = parsed.id || ''
                    if (btnId) {
                        m.text = _injectPrefix(btnId)
                        m.interactiveId = btnId
                    }
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
            m.quoted.sender = conn.decodeJid(m.msg.contextInfo.participant)
            if (m.quoted.sender && m.quoted.sender.endsWith('@lid')) {
                const resolvedQuotedSender = conn.resolveLid(m.quoted.sender, m.quoted.chat)
                if (resolvedQuotedSender && resolvedQuotedSender !== m.quoted.sender) {
                    m.quoted.sender = conn.decodeJid(resolvedQuotedSender)
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

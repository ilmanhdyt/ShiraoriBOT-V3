// addsewa.js - Sistem sewa bot grup lengkap
// Command: .addsewa .listsewa .delsewa

function msToDate(ms) {
    if (ms <= 0) return '0 detik'
    const days = Math.floor(ms / 86400000)
    const hours = Math.floor((ms % 86400000) / 3600000)
    const minutes = Math.floor((ms % 3600000) / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    const parts = []
    if (days) parts.push(`${days} hari`)
    if (hours) parts.push(`${hours} jam`)
    if (minutes) parts.push(`${minutes} menit`)
    if (seconds) parts.push(`${seconds} detik`)
    return parts.join(' ') || '0 detik'
}

function extractInviteCode(input = '') {
    const match = input.trim().match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/i)
    return match?.[1] || null
}

function normalizeJid(jid = '') {
    return jid.split(':')[0]
}

function ensurePendingSewaJoinStore() {
    if (!global.pendingSewaJoins || typeof global.pendingSewaJoins !== 'object') {
        global.pendingSewaJoins = {}
    }
    return global.pendingSewaJoins
}

function formatExpired(dateMs) {
    return new Date(dateMs).toLocaleString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

function getWelcomeText() {
    return (
        `🌸 Ossu minna-san!\n\n` +
        `ShiraoriBOT berhasil bergabung ke grup ini ✨\n\n` +
        `🎮 Gunakan .menu untuk membuka fitur\n` +
        `🪙 Main game dan kumpulkan hadiah\n` +
        `⚔️ Nikmati petualangan bersama ShiraoriBOT!\n\n` +
        `Semoga betah yaa 💖`
    )
}

function setupPendingSewaJoinListener(conn) {
    if (!conn?.ev || conn._pendingSewaJoinListenerInstalled) return
    conn._pendingSewaJoinListenerInstalled = true

    conn.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (action !== 'add') return

        const pending = ensurePendingSewaJoinStore()[id]
        if (!pending) return

        const botJid = normalizeJid(conn.user?.id || conn.user?.jid || '')
        const hasBot = (participants || []).some(jid => normalizeJid(jid) === botJid)
        if (!hasBot) return

        delete global.pendingSewaJoins[id]

        try {
            await conn.sendMessage(id, {
                text:
                    getWelcomeText() +
                    `\n\n` +
                    `✅ *Sewa Bot Aktif!*\n` +
                    `⏳ Durasi: *${pending.hari} hari*\n` +
                    `📅 Expired: *${pending.expDate}*`
            })
        } catch (_) {}

        if (pending.notifyJid) {
            try {
                await conn.sendMessage(pending.notifyJid, {
                    text:
                        `✅ Bot sudah di-acc ke grup *${pending.groupName || id}*.\n` +
                        `Sekarang bot sudah bisa merespons di grup target.`
                })
            } catch (_) {}
        }
    })
}

async function resolveGroupId(conn, input) {
    if (!input) return null
    input = input.trim()

    if (input.endsWith('@g.us')) return input
    if (/^\d+$/.test(input)) return `${input}@g.us`

    const code = extractInviteCode(input)
    if (code) {
        try {
            const info = await conn.groupGetInviteInfo(code)
            if (info?.id) return info.id
        } catch (e) {
            throw `❌ Link grup tidak valid atau sudah expired!\nError: ${e.message}`
        }
    }

    return null
}

async function getGroupName(conn, jid) {
    try {
        const meta = await conn.groupMetadata(jid)
        return meta?.subject || jid
    } catch (_) {
        return jid
    }
}

async function isBotAlreadyInGroup(conn, jid) {
    try {
        const meta = await conn.groupMetadata(jid)
        const botJid = normalizeJid(conn.user?.id || conn.user?.jid || '')
        return (meta?.participants || []).some(p => normalizeJid(p?.id || '') === botJid)
    } catch (_) {
        return false
    }
}

async function joinGroupFromInvite(conn, inviteCode, groupJid) {
    try {
        await conn.groupAcceptInvite(inviteCode)
        const joined = await isBotAlreadyInGroup(conn, groupJid)
        return {
            joined,
            pendingApproval: !joined
        }
    } catch (e) {
        const message = String(e?.message || e || '')
        const lowered = message.toLowerCase()
        const pendingApproval =
            lowered.includes('approval') ||
            lowered.includes('approve') ||
            lowered.includes('membership') ||
            lowered.includes('request') ||
            lowered.includes('permission') ||
            lowered.includes('perizinan') ||
            lowered.includes('admin approval')

        if (pendingApproval) {
            return {
                joined: false,
                pendingApproval: true
            }
        }

        throw e
    }
}

let schedulerStarted = false

function startSewaScheduler(conn) {
    if (schedulerStarted) return
    schedulerStarted = true

    const notifiedH1 = new Set()
    const notifiedH0 = new Set()

    setInterval(async () => {
        try {
            const chats = global.db?.data?.chats
            if (!chats) return

            const now = Date.now()

            for (const [jid, chat] of Object.entries(chats)) {
                if (!jid.endsWith('@g.us')) continue
                if (!chat?.expired || chat.expired <= 0) continue

                const sisa = chat.expired - now

                if (sisa <= 0) {
                    try {
                        await conn.sendMessage(jid, {
                            text:
                                `⏰ *Masa sewa bot telah habis!*\n\n` +
                                `Bot akan meninggalkan grup ini.\n` +
                                `Hubungi owner untuk perpanjang sewa. 👋`
                        })
                        await new Promise(resolve => setTimeout(resolve, 2000))
                        await conn.groupLeave(jid)
                        console.log(`[SEWA] Leave grup expired: ${jid}`)
                    } catch (e) {
                        console.error(`[SEWA] Gagal leave ${jid}:`, e.message)
                    }
                    chat.expired = 0
                    await global.db.write()
                    notifiedH1.delete(jid)
                    notifiedH0.delete(jid)
                    continue
                }

                if (sisa <= 86700000 && sisa > 3600000 && !notifiedH1.has(jid)) {
                    notifiedH1.add(jid)
                    try {
                        await conn.sendMessage(jid, {
                            text:
                                `⚠️ *Peringatan Sewa Bot!*\n\n` +
                                `Masa sewa bot di grup ini akan habis dalam:\n` +
                                `⏳ *${msToDate(sisa)}*\n\n` +
                                `📅 Expired: *${formatExpired(chat.expired)}*\n\n` +
                                `Segera hubungi owner untuk perpanjang sewa!`
                        })
                    } catch (_) {}
                }

                if (sisa <= 3660000 && sisa > 0 && !notifiedH0.has(jid)) {
                    notifiedH0.add(jid)
                    try {
                        await conn.sendMessage(jid, {
                            text:
                                `🚨 *DARURAT! Sewa Bot Hampir Habis!*\n\n` +
                                `Sisa waktu: *${msToDate(sisa)}*\n\n` +
                                `⚡ Hubungi owner sekarang atau bot akan\n` +
                                `meninggalkan grup dalam waktu dekat!`
                        })
                    } catch (_) {}
                }
            }
        } catch (e) {
            console.error('[SEWA Scheduler] Error:', e.message)
        }
    }, 60_000)

    console.log('[SEWA] Scheduler aktif')
}

global.startSewaScheduler = startSewaScheduler

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const cmd = command.toLowerCase()
    setupPendingSewaJoinListener(conn)

    if (cmd === 'listsewa') {
        const chats = global.db?.data?.chats || {}
        const now = Date.now()
        const aktif = Object.entries(chats).filter(([jid, c]) =>
            jid.endsWith('@g.us') && c?.expired > now
        )

        if (!aktif.length) return m.reply('📋 Belum ada grup yang aktif sewa.')

        aktif.sort((a, b) => a[1].expired - b[1].expired)

        let list = `╭─「 📋 *LIST SEWA BOT* 」\n│\n`
        let no = 1
        for (const [jid, chat] of aktif) {
            const sisa = chat.expired - now
            const expDate = new Date(chat.expired).toLocaleString('id-ID', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
            let nama = jid
            try {
                nama = (await conn.groupMetadata(jid).catch(() => null))?.subject || jid
            } catch (_) {}

            list +=
                `│  *${no++}.* ${nama}\n` +
                `│  🆔 \`${jid}\`\n` +
                `│  ⏳ Sisa: ${msToDate(sisa)}\n` +
                `│  📅 Exp: ${expDate}\n│\n`
        }
        list += `╰─────────────────\n_Total: ${aktif.length} grup aktif_`

        return m.reply(list)
    }

    if (cmd === 'delsewa') {
        const input = args[0]
        const target = m.isGroup && !input ? m.chat : await resolveGroupId(conn, input)

        if (!target) {
            return m.reply(
                `❌ Masukkan ID/link grup!\n` +
                `*Contoh: ${usedPrefix}delsewa 120363xxx@g.us*`
            )
        }

        const chat = global.db?.data?.chats?.[target]
        if (!chat?.expired || chat.expired <= 0) {
            return m.reply('❌ Grup ini tidak punya sewa aktif.')
        }

        const nama = await getGroupName(conn, target)
        chat.expired = 0
        delete ensurePendingSewaJoinStore()[target]
        await global.db.write()

        return m.reply(
            `✅ *Sewa dihapus!*\n\n` +
            `📋 Grup: *${nama}*\n` +
            `🆔 \`${target}\``
        )
    }

    let targetInput = null
    let hariInput = null

    if (args.length === 0) {
        throw `Format salah!\n*Contoh: ${usedPrefix}addsewa https://chat.whatsapp.com/xxx 30*`
    }

    if (m.isGroup && !isNaN(args[0]) && parseInt(args[0]) > 0 && !args[0].includes('@') && !args[0].includes('chat.whatsapp')) {
        targetInput = m.chat
        hariInput = parseInt(args[0])
    } else {
        targetInput = args[0]
        hariInput = parseInt(args[1])
    }

    if (!hariInput || isNaN(hariInput) || hariInput <= 0) {
        throw `Masukkan jumlah hari yang valid!\n*Contoh: ${usedPrefix}addsewa https://chat.whatsapp.com/xxx 30*`
    }

    const inviteCode = extractInviteCode(targetInput || '')

    let who
    try {
        who = await resolveGroupId(conn, targetInput)
    } catch (e) {
        return m.reply(String(e))
    }

    if (!who) {
        return m.reply(
            `❌ Target grup tidak valid!\n` +
            `Gunakan link invite atau JID grup.\n` +
            `*Contoh: ${usedPrefix}addsewa https://chat.whatsapp.com/xxx 30*`
        )
    }

    const now = Date.now()
    const jumlahMs = 86400000 * hariInput

    if (!global.db.data.chats) global.db.data.chats = {}
    if (!global.db.data.chats[who]) global.db.data.chats[who] = {}
    const chat = global.db.data.chats[who]

    if (chat.expired && chat.expired > now) {
        const sisa = chat.expired - now
        const expDate = formatExpired(chat.expired)
        const nama = await getGroupName(conn, who)

        return m.reply(
            `⚠️ *Grup ini masih aktif sewa!*\n\n` +
            `📋 Grup: *${nama}*\n` +
            `⏳ Sisa: *${msToDate(sisa)}*\n` +
            `📅 Expired: ${expDate}\n\n` +
            `Gunakan *${usedPrefix}addsewa ${who} ${hariInput}* untuk *perpanjang*,\n` +
            `atau *${usedPrefix}delsewa* untuk reset dulu.`
        )
    }

    let joined = await isBotAlreadyInGroup(conn, who)
    let pendingApproval = false

    if (inviteCode && !joined) {
        const joinResult = await joinGroupFromInvite(conn, inviteCode, who)
        joined = joinResult.joined
        pendingApproval = joinResult.pendingApproval
    }

    chat.expired = now + jumlahMs
    await global.db.write()

    const sisaMs = chat.expired - now
    const expDate = formatExpired(chat.expired)
    const nama = await getGroupName(conn, who)

    if (pendingApproval) {
        ensurePendingSewaJoinStore()[who] = {
            hari: hariInput,
            expDate,
            notifyJid: m.sender,
            groupName: nama
        }
    } else {
        delete ensurePendingSewaJoinStore()[who]
    }

    if (joined) {
        try {
            await conn.sendMessage(who, {
                text:
                    getWelcomeText() +
                    `\n\n` +
                    `✅ *Sewa Bot Aktif!*\n` +
                    `⏳ Durasi: *${hariInput} hari*\n` +
                    `📅 Expired: *${expDate}*`
            })
        } catch (_) {}
    }

    startSewaScheduler(conn)

    let statusJoin = 'Sudah ada di grup'
    if (inviteCode) {
        if (pendingApproval) statusJoin = 'Grup memakai perizinan, menunggu di acc'
        else if (joined) statusJoin = 'Berhasil masuk ke grup'
        else statusJoin = 'Link diproses, bot belum terdeteksi di grup'
    }

    return m.reply(
        `╭─「 ✅ *SEWA DITAMBAH* 」\n` +
        `│\n` +
        `│  📋 *Grup:* ${nama}\n` +
        `│  🆔 \`${who}\`\n` +
        `│  ➕ *Durasi:* ${hariInput} hari\n` +
        `│  ⏳ *Sisa:* ${msToDate(sisaMs)}\n` +
        `│  📅 *Expired:* ${expDate}\n` +
        `│  📥 *Status join:* ${statusJoin}\n` +
        `│\n` +
        `╰─────────────────`
    )
}

handler.help = ['addsewa <link/id> <hari>', 'listsewa', 'delsewa <id>']
handler.tags = ['owner']
handler.command = /^(addsewa|listsewa|delsewa)$/i
handler.owner = true

module.exports = handler

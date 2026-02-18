// cekowner.js - Tampilkan kontak owner bot
// Updated: pakai Baileys v6 API (tidak pakai MessageType lagi)

const PhoneNumber = require('awesome-phonenumber')

let handler = async function (m) {
    // Ambil semua owner dari config (bisa lebih dari 2)
    const owners = (global.owner || []).filter(n => n && n.replace(/[^0-9]/g, '').length > 5)

    if (!owners.length) return m.reply('❌ Owner belum dikonfigurasi di config.js')

    const contacts = []

    for (let i = 0; i < owners.length; i++) {
        const number = owners[i].replace(/[^0-9]/g, '')
        const jid    = number + '@s.whatsapp.net'

        // Nama owner (bisa dikustom di sini)
        const ownerNames = ['Ilman', 'Cosette', 'Owner 3', 'Owner 4']
        const name = ownerNames[i] || `Owner ${i + 1}`

        // Cek apakah nomor aktif di WA
        let isBusiness = false
        let bizName    = ''
        let bizDesc    = ''

        try {
            const onW = await this.isOnWhatsApp(jid)
            isBusiness = onW?.isBusiness || false

            if (isBusiness) {
                bizName = (this.contacts?.[jid]?.vname || this.getName(jid) || '').replace(/\n/g, '\\n')
                try {
                    const profile = await this.getBusinessProfile(jid)
                    bizDesc = (profile?.description || '').replace(/\n/g, '\\n')
                } catch (_) {}
            }
        } catch (_) {}

        // Format nomor internasional
        let intlNumber = '+' + number
        try {
            const pn = PhoneNumber('+' + number)
            if (pn.isValid()) intlNumber = pn.getNumber('international')
        } catch (_) {}

        // Buat vCard
        let vcard = `BEGIN:VCARD\nVERSION:3.0\nN:;${name};;;\nFN:${name}\nTEL;type=CELL;type=VOICE;waid=${number}:${intlNumber}`

        if (isBusiness) {
            if (bizName) vcard += `\nX-WA-BIZ-NAME:${bizName}`
            if (bizDesc) vcard += `\nX-WA-BIZ-DESCRIPTION:${bizDesc}`
        }

        vcard += '\nEND:VCARD'

        contacts.push({
            displayName: name,
            vcard: vcard.trim()
        })
    }

    // Kirim sebagai contact card
    try {
        if (contacts.length === 1) {
            // Satu kontak
            await this.sendMessage(m.chat, {
                contacts: {
                    displayName: contacts[0].displayName,
                    contacts: [{ vcard: contacts[0].vcard }]
                }
            }, { quoted: m })
        } else {
            // Banyak kontak sekaligus
            await this.sendMessage(m.chat, {
                contacts: {
                    displayName: `Owner ${global.namabot || 'Bot'}`,
                    contacts: contacts.map(c => ({ vcard: c.vcard }))
                }
            }, { quoted: m })
        }
    } catch (e) {
        // Fallback: kirim satu per satu jika batch gagal
        for (const c of contacts) {
            try {
                await this.sendMessage(m.chat, {
                    contacts: {
                        displayName: c.displayName,
                        contacts: [{ vcard: c.vcard }]
                    }
                }, { quoted: m })
            } catch (_) {
                await m.reply(`👤 *${c.displayName}*\n📱 ${c.vcard.match(/TEL[^:]+:([^\n]+)/)?.[1] || '?'}`)
            }
        }
    }
}

handler.help    = ['owner', 'creator']
handler.tags    = ['info']
handler.command = /^(owner|creator)$/i
handler.owner    = false
handler.mods     = false
handler.premium  = false
handler.group    = false
handler.private  = false
handler.admin    = false
handler.botAdmin = false
handler.exp      = 3

module.exports = handler
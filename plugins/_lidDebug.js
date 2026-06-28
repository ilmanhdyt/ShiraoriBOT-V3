// _lidDebug.js — plugin debug untuk diagnosa LID unresolved
// Ketik .lidebug di grup untuk dump struktur participant raw
// Ketik .liddump untuk paksa fetch groupMetadata dan print semua field participant

exports.before = async function(m) { return true }

exports.command = ['lidebug', 'liddump', 'lidinfo']
exports.tags = ['owner']
exports.isOwner = true

exports.handler = async function(m, { conn, args, isOwner }) {
    if (!isOwner) return

    const cmd = (m.text || '').trim().toLowerCase().replace(/^[^\w]/, '')

    if (cmd === 'lidinfo') {
        // Info ringkas sender saat ini
        const rawKey = JSON.stringify(m.key, null, 2)
        const info = [
            `📌 *LID Info*`,
            ``,
            `sender: \`${m.sender}\``,
            `m.participant: \`${m.participant || '-'}\``,
            `m.key.participant: \`${m.key?.participant || '-'}\``,
            `m.key.remoteJid: \`${m.key?.remoteJid || '-'}\``,
            `m.key.fromMe: ${m.key?.fromMe}`,
            `m.key.senderPn: \`${m.key?.senderPn || '-'}\``,
            `m.key.sn: \`${m.key?.sn || '-'}\``,
            `m.isGroup: ${m.isGroup}`,
            `m.chat: \`${m.chat}\``,
        ].join('\n')
        await conn.sendMessage(m.chat, { text: info }, { quoted: m })
        return
    }

    if (cmd === 'lidebug' || cmd === 'liddump') {
        if (!m.isGroup) {
            await conn.sendMessage(m.chat, { text: '⚠️ Harus dijalankan di dalam grup.' }, { quoted: m })
            return
        }

        await conn.sendMessage(m.chat, { text: '🔍 Fetching groupMetadata...' }, { quoted: m })

        try {
            const meta = await conn.groupMetadata(m.chat)
            if (!meta?.participants?.length) {
                await conn.sendMessage(m.chat, { text: '❌ Tidak ada participant.' }, { quoted: m })
                return
            }

            // Print 3 participant pertama lengkap
            const samples = meta.participants.slice(0, 3)
            let out = `📋 *groupMetadata Participants (${meta.participants.length} total)*\n\n`

            for (let i = 0; i < samples.length; i++) {
                const p = samples[i]
                out += `*[${i+1}] Fields:* ${Object.keys(p).join(', ')}\n`
                out += `  id: \`${p.id}\`\n`
                out += `  lid: \`${p.lid}\`\n`
                out += `  senderPn: \`${p.senderPn || '-'}\`\n`
                out += `  phoneNumber: \`${p.phoneNumber || '-'}\`\n`
                out += `  pn: \`${p.pn || '-'}\`\n`
                out += `  admin: ${p.admin || 'null'}\n`
                // Dump semua field unknown
                for (const [k, v] of Object.entries(p)) {
                    if (!['id','lid','senderPn','phoneNumber','pn','admin'].includes(k)) {
                        out += `  ${k}: \`${typeof v === 'object' ? JSON.stringify(v) : v}\`\n`
                    }
                }
                out += '\n'
            }

            // Juga dump m.key raw
            out += `*m.key fields:* ${Object.keys(m.key || {}).join(', ')}\n`
            out += `  senderPn: \`${m.key?.senderPn || '-'}\`\n`

            // Kirim ke chat
            await conn.sendMessage(m.chat, { text: out }, { quoted: m })

            // Juga kirim ke owner via DM kalau panjang
            console.log('[LID DEBUG DUMP]')
            console.log('m.key:', JSON.stringify(m.key, null, 2))
            console.log('participants[0]:', JSON.stringify(meta.participants[0], null, 2))

        } catch (e) {
            await conn.sendMessage(m.chat, { text: `❌ Error: ${e.message}` }, { quoted: m })
        }
    }
}

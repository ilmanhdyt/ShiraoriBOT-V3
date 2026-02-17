let handler = async (m, { conn }) => {
    // React ke perintah
    await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    
    let info = `
*=== DEBUG INFO ===*

*Your Number:*
${m.sender}

*Formatted Number:*
${m.sender.replace(/[^0-9]/g, '')}

*Owner List (dari config):*
${global.owner.join('\n')}

*Owner List (formatted):*
${global.owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').join('\n')}

*Is Owner?*
${global.owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender) ? '✅ YES' : '❌ NO'}

*Tips:*
Pastikan nomor di config.js sama dengan nomor formatted Anda (tanpa @s.whatsapp.net)
`.trim()
    
    await m.reply(info)
}

handler.help = ['cekowner']
handler.tags = ['info']
handler.command = /^(cekowner|whoami|debugowner)$/i

module.exports = handler
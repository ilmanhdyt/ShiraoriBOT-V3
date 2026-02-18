let handler = async (m, { conn }) => {
    // React ke perintah
    await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })
    
    // Data dari user
    let senderNumber = m.sender.replace(/[^0-9]/g, '')
    
    // Check bot owner mapping
    let isBotOwner = false
    let mappedOwner = ''
    if (global.botOwnerMap && global.botOwnerMap[senderNumber]) {
        isBotOwner = true
        mappedOwner = global.botOwnerMap[senderNumber]
    }
    
    // Data dari config
    let ownerNumbers = global.owner.map(v => v.replace(/[^0-9]/g, ''))
    let ownerFormatted = global.owner.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net')
    
    // Pengecekan
    let check1 = ownerNumbers.includes(senderNumber)
    let check2 = ownerFormatted.includes(m.sender)
    
    // isROwner dari handler (updated dengan bot mapping)
    let isROwner = isBotOwner ||
                  ownerNumbers.includes(senderNumber) || 
                  ownerFormatted.includes(m.sender) ||
                  global.owner.includes(m.sender) ||
                  global.owner.includes(senderNumber)
    let isOwner = isROwner || m.fromMe
    
    let info = `
*=== DETAILED DEBUG INFO ===*

*1. YOUR DATA:*
Raw Sender: ${m.sender}
Sender Number: ${senderNumber}
From Me: ${m.fromMe}

*2. CONFIG DATA:*
Owner Array: ${JSON.stringify(global.owner)}
Owner Numbers: ${JSON.stringify(ownerNumbers)}
Bot Owner Map: ${global.botOwnerMap ? JSON.stringify(global.botOwnerMap) : 'Not configured'}

*3. BOT MAPPING:*
Is Bot Owner: ${isBotOwner ? '✅ YES' : '❌ NO'}
${isBotOwner ? `Mapped to: ${mappedOwner}` : ''}

*4. CHECKS:*
Check Numbers Only: ${check1 ? '✅' : '❌'}
Check With @s.whatsapp.net: ${check2 ? '✅' : '❌'}
Bot Mapping Check: ${isBotOwner ? '✅' : '❌'}

*5. HANDLER LOGIC:*
isROwner (updated): ${isROwner ? '✅ YES' : '❌ NO'}
isOwner (with fromMe): ${isOwner ? '✅ YES' : '❌ NO'}

*6. FINAL RESULT:*
${isOwner ? '✅✅✅ ANDA ADALAH OWNER! ✅✅✅' : '❌ Anda BUKAN owner'}

*7. TIPS:*
${!isOwner ? `Tambahkan mapping di config.js:
global.botOwnerMap = {
    '${senderNumber}': '6281351047727'
}` : 'Konfigurasi sudah benar! ✅'}
`.trim()
    
    await m.reply(info)
}

handler.help = ['testowner']
handler.tags = ['owner']
handler.command = /^(testowner|debugowner2|ownertest)$/i
handler.premium = true
module.exports = handler
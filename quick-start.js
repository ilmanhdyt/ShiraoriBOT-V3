#!/usr/bin/env node
/**
 * Quick Start - Minimal bot untuk testing
 * Gunakan ini jika main.js error
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    PHONENUMBER_MCC
} = require('@whiskeysockets/baileys')
const P = require('pino')
const { Boom } = require('@hapi/boom')
const readline = require('readline')
const fs = require('fs')

console.log('🚀 Quick Start - Minimal Bot')

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    return new Promise((resolve) => {
        rl.question(text, (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}

async function startMinimalBot() {
    // Auth state
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    
    // Get Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`)

    // Create socket
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: P({ level: 'silent' })
    })

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                : true
            
            console.log('Connection closed. Reconnect:', shouldReconnect)
            
            if (shouldReconnect) {
                setTimeout(() => startMinimalBot(), 3000)
            }
        } else if (connection === 'open') {
            console.log('✅ Connected!')
        }
    })

    // Save credentials
    sock.ev.on('creds.update', saveCreds)

    // Handle messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return
        
        const text = m.message.conversation || 
                     m.message.extendedTextMessage?.text || ''
        
        console.log(`Message from ${m.key.remoteJid}: ${text}`)
        
        // Simple reply
        if (text === '.ping') {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '🏓 Pong!' 
            }, { quoted: m })
        }
        
        if (text === '.test') {
            await sock.sendMessage(m.key.remoteJid, { 
                text: '✅ Bot is working!\n\nThis is minimal mode. Run main.js for full features.' 
            }, { quoted: m })
        }
    })

    return sock
}

// Start
startMinimalBot().catch(err => {
    console.error('Error:', err)
    process.exit(1)
})

#!/usr/bin/env node
/**
 * Test script to verify Baileys installation and bot compatibility
 */

console.log('🔍 Testing bot dependencies...\n')

// Test 1: Node version
console.log('1. Node.js Version:')
console.log(`   ✓ ${process.version}`)
if (parseInt(process.version.slice(1)) < 16) {
    console.log('   ⚠️  Warning: Node.js 16+ recommended')
}

// Test 2: Required modules
console.log('\n2. Testing required modules:')
const requiredModules = [
    '@whiskeysockets/baileys',
    'pino',
    '@hapi/boom',
    'node-cache',
    'axios',
    'chalk',
    'readline'
]

console.log('   ℹ️  lowdb - Using built-in version (lib/lowdb)')

let hasErrors = false

for (const moduleName of requiredModules) {
    try {
        require.resolve(moduleName)
        console.log(`   ✓ ${moduleName}`)
    } catch (e) {
        console.log(`   ✗ ${moduleName} - NOT FOUND!`)
        hasErrors = true
    }
}

// Test 3: Baileys imports
console.log('\n3. Testing Baileys imports:')
try {
    const Baileys = require('@whiskeysockets/baileys')
    const requiredExports = [
        'default',
        'useMultiFileAuthState',
        'DisconnectReason',
        'fetchLatestBaileysVersion',
        'makeCacheableSignalKeyStore',
        'PHONENUMBER_MCC'
    ]
    
    for (const exp of requiredExports) {
        if (Baileys[exp]) {
            console.log(`   ✓ ${exp}`)
        } else {
            console.log(`   ✗ ${exp} - NOT FOUND!`)
            hasErrors = true
        }
    }
    
    // Check makeInMemoryStore
    if (Baileys.makeInMemoryStore) {
        console.log(`   ✓ makeInMemoryStore (available)`)
    } else {
        console.log(`   ⚠️  makeInMemoryStore (not available - will use fallback)`)
    }
    
} catch (e) {
    console.log(`   ✗ Failed to import Baileys: ${e.message}`)
    hasErrors = true
}

// Test 4: Config file
console.log('\n4. Testing config file:')
try {
    require('./config')
    console.log(`   ✓ config.js loaded`)
    if (global.owner && global.owner.length > 0) {
        console.log(`   ✓ Owner configured: ${global.owner[0]}`)
    } else {
        console.log(`   ⚠️  Owner not configured in config.js`)
    }
} catch (e) {
    console.log(`   ✗ Config error: ${e.message}`)
    hasErrors = true
}

// Test 5: Lib files
console.log('\n5. Testing library files:')
const libFiles = ['./lib/simple.js', './handler.js']
for (const file of libFiles) {
    try {
        require.resolve(file)
        console.log(`   ✓ ${file}`)
    } catch (e) {
        console.log(`   ✗ ${file} - NOT FOUND!`)
        hasErrors = true
    }
}

// Final result
console.log('\n' + '='.repeat(50))
if (hasErrors) {
    console.log('❌ Some tests failed! Run: npm install')
    process.exit(1)
} else {
    console.log('✅ All tests passed! Bot is ready to start.')
    console.log('\nTo start bot:')
    console.log('  • npm start (QR Code)')
    console.log('  • node index.js --pairing-code (Pairing Code)')
}
console.log('='.repeat(50))

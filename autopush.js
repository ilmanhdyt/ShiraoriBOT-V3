// autopush.js - Auto Push ke GitHub saat ada file berubah
// Jalankan sekali: node autopush.js
// Atau tambahkan di package.json scripts

const fs     = require('fs')
const path   = require('path')
const cp     = require('child_process')
const chokidar = require('chokidar') // npm install chokidar

// ═══════════════════════════════════════════════════════════════
// KONFIGURASI
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
    // Delay setelah deteksi perubahan sebelum push (ms)
    // Supaya tidak push setiap ketik 1 huruf
    debounceMs: 5000,

    // Folder/file yang DIAWASI
    watchPaths: [
        'plugins',
        'lib',
        'config.js',
        'handler.js',
        // Tambah path lain jika perlu
    ],

    // Folder/file yang DIABAIKAN (tidak dipush)
    ignorePaths: [
        'node_modules',
        'session',
        '.git',
        'database',          // jangan push database (data user)
        '*.log',
        '.env',
        'mafia_empire.json',
        'npc_system.json',
    ],

    // Pesan commit otomatis
    commitMessage: () => {
        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
        return `auto: update ${now}`
    },

    // Branch target
    branch: 'main',
}

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function run(cmd) {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message))
            else resolve(stdout.trim())
        })
    })
}

function log(msg, color = '\x1b[36m') {
    const time = new Date().toLocaleTimeString('id-ID')
    console.log(color + `[${time}] ${msg}\x1b[0m`)
}

// ═══════════════════════════════════════════════════════════════
// CEK GIT CONFIG
// ═══════════════════════════════════════════════════════════════
async function checkGitConfig() {
    try {
        await run('git config user.email')
    } catch {
        log('Git email belum diset, setting default...', '\x1b[33m')
        await run('git config user.email "bot@shiraori.local"').catch(() => {})
        await run('git config user.name "ShiraoriBOT"').catch(() => {})
    }

    // Cek remote
    try {
        const remote = await run('git remote get-url origin')
        log(`Remote: ${remote}`, '\x1b[32m')
    } catch {
        log('❌ Remote "origin" tidak ditemukan! Pastikan sudah ada git remote.', '\x1b[31m')
        log('Jalankan: git remote add origin https://github.com/username/repo.git', '\x1b[33m')
        process.exit(1)
    }
}

// ═══════════════════════════════════════════════════════════════
// AUTO PUSH
// ═══════════════════════════════════════════════════════════════
let pushTimer = null
let changedFiles = new Set()

async function doPush() {
    if (changedFiles.size === 0) return

    const files = [...changedFiles]
    changedFiles.clear()

    try {
        log(`📦 Mendeteksi ${files.length} perubahan, mulai push...`, '\x1b[33m')
        files.forEach(f => log(`  • ${f}`, '\x1b[90m'))

        // Cek apakah ada perubahan
        const status = await run('git status --porcelain')
        if (!status) {
            log('Tidak ada perubahan untuk dipush.', '\x1b[90m')
            return
        }

        // Stage semua perubahan (kecuali yang di .gitignore)
        await run('git add -A')

        // Commit
        const msg = CONFIG.commitMessage()
        await run(`git commit -m "${msg}"`)
        log(`✅ Commit: "${msg}"`, '\x1b[32m')

        // Push
        await run(`git push origin ${CONFIG.branch}`)
        log(`🚀 Push ke GitHub berhasil!`, '\x1b[32m')

    } catch (e) {
        // Jika error karena tidak ada yang berubah
        if (e.message.includes('nothing to commit')) {
            log('Tidak ada perubahan baru.', '\x1b[90m')
            return
        }
        // Jika error karena diverged (ada commit di remote yang belum dipull)
        if (e.message.includes('rejected') || e.message.includes('diverged')) {
            log('⚠️ Repo diverged! Mencoba pull dulu...', '\x1b[33m')
            try {
                await run('git pull --rebase origin ' + CONFIG.branch)
                await run(`git push origin ${CONFIG.branch}`)
                log('🚀 Push berhasil setelah rebase!', '\x1b[32m')
            } catch (e2) {
                log('❌ Push gagal: ' + e2.message, '\x1b[31m')
            }
            return
        }
        log('❌ Push error: ' + e.message, '\x1b[31m')
    }
}

function schedulePush(filePath) {
    changedFiles.add(filePath)
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = setTimeout(doPush, CONFIG.debounceMs)
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
    console.log('\x1b[36m%s\x1b[0m', '╔══════════════════════════════════════╗')
    console.log('\x1b[36m%s\x1b[0m', '║   ShiraoriBOT - Auto Push GitHub     ║')
    console.log('\x1b[36m%s\x1b[0m', '╚══════════════════════════════════════╝')
    console.log('')

    await checkGitConfig()

    // Buat .gitignore otomatis jika belum ada
    const gitignorePath = path.join(process.cwd(), '.gitignore')
    if (!fs.existsSync(gitignorePath)) {
        const gitignoreContent = [
            'node_modules/',
            'session/',
            '.env',
            'database/',
            '*.log',
            '.DS_Store',
        ].join('\n')
        fs.writeFileSync(gitignorePath, gitignoreContent)
        log('.gitignore dibuat otomatis', '\x1b[32m')
    }

    // Setup watcher
    const ignored = CONFIG.ignorePaths.map(p =>
        p.includes('*') ? new RegExp(p.replace('*', '.*')) : path.join(process.cwd(), p)
    )

    const watcher = chokidar.watch(CONFIG.watchPaths, {
        cwd       : process.cwd(),
        ignored   : [/node_modules/, /session/, /\.git/, /database/, /\.log$/],
        persistent: true,
        ignoreInitial: true,    // jangan trigger saat pertama start
    })

    watcher
        .on('change', filePath => {
            log(`📝 Berubah: ${filePath}`, '\x1b[33m')
            schedulePush(filePath)
        })
        .on('add', filePath => {
            log(`➕ Ditambah: ${filePath}`, '\x1b[32m')
            schedulePush(filePath)
        })
        .on('unlink', filePath => {
            log(`🗑️  Dihapus: ${filePath}`, '\x1b[31m')
            schedulePush(filePath)
        })
        .on('ready', () => {
            log(`👀 Memantau perubahan... (delay ${CONFIG.debounceMs/1000}s sebelum push)`, '\x1b[32m')
            log(`📁 Path: ${CONFIG.watchPaths.join(', ')}`, '\x1b[90m')
            log(`🌿 Branch: ${CONFIG.branch}`, '\x1b[90m')
            console.log('')
        })

    // Graceful exit
    process.on('SIGINT',  () => { log('Auto-push dihentikan.', '\x1b[33m'); process.exit(0) })
    process.on('SIGTERM', () => { log('Auto-push dihentikan.', '\x1b[33m'); process.exit(0) })
}

main().catch(e => {
    console.error('\x1b[31m%s\x1b[0m', 'Fatal: ' + e.message)
    process.exit(1)
})

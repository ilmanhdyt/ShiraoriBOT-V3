const { getDbUser, jidToNum, numToJid, displayForJid } = require('../lib/jidUtils')
const { resolveTargetUser } = require('../lib/resolveTarget')

// plugins/maling.js
// ═══════════════════════════════════════════════════════════════════
//  💰 SISTEM MALING — Curi uang user lain
//
//  Command:
//    .maling @user     → coba curi uang user lain
//    .riwayatmaling    → lihat riwayat aksi maling kamu
//    .wanted           → daftar maling tersangkut paling banyak
//
//  Cooldown: 10 menit per aksi
//  Target harus punya minimal 500 koin
//  Hasil random: sukses/gagal dengan berbagai skenario
// ═══════════════════════════════════════════════════════════════════

// ── Skenario SUKSES ───────────────────────────────────────────────────────────
// fn(thief, target, amount) → string cerita
const SUCCESS_SCENARIOS = [
    (t, v, a) => [
        `🌙 Tengah malam, *${t}* menyelinap masuk ke rumah *${v}*...`,
        `🔦 Dengan hati-hati membuka brankas menggunakan kawat kecil...`,
        `💨 KABUR! *${t}* berhasil membawa *${fmt(a)} koin* tanpa ketahuan!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
    (t, v, a) => [
        `🎭 *${t}* menyamar jadi tukang pos dan mengetuk pintu *${v}*...`,
        `📦 "Paket buat Anda!" — saat *${v}* tanda tangan, dompetnya raib...`,
        `🏃 *${t}* kabur naik motor sambil ketawa!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
    (t, v, a) => [
        `🐱 *${t}* pura-pura jadi kucing liar di depan rumah *${v}*...`,
        `😺 *${v}* tertipu, keluar buat kasih makan... tas tertinggal di luar!`,
        `💸 *${t}* ambil dompet, kabur lewat got!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
    (t, v, a) => [
        `🍜 *${t}* buka warung mie palsu di depan rumah *${v}*...`,
        `🥢 *${v}* datang pesan mie, pas bayar... uang kembaliannya 'lebih'!`,
        `😂 Warungnya udah tutup sebelum *${v}* sadar ditipu!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
    (t, v, a) => [
        `🕵️ *${t}* pakai kacamata hitam dan topi baret, masuk ke rumah *${v}*...`,
        `🖥️ Langsung transfer via mobile banking dalam 30 detik...`,
        `📲 DONE! Semua transaksi dihapus, jejak hilang!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
    (t, v, a) => [
        `🌊 *${t}* pura-pura tenggelam di kolam depan rumah *${v}*...`,
        `🏊 *${v}* panik loncat buat nolong, dompet & HP ketinggalan di pinggir!`,
        `😈 *${t}* langsung sembuh seketika dan kabur bawa semua!`,
        `✅ *BERHASIL!* +${fmt(a)} koin masuk ke dompetmu 💰`
    ],
]

// ── Skenario GAGAL — kena polisi ──────────────────────────────────────────────
const FAIL_POLICE = [
    (t, fine) => [
        `🕵️ *${t}* tidak tahu kalau ada CCTV tersembunyi...`,
        `👮 POLISI DATANG! "BERHENTI ATAU SAYA TEMBAK!"`,
        `🚔 *${t}* ditangkap dan dikenakan denda *${fmt(fine)} koin*!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (denda polisi) 👮`
    ],
    (t, fine) => [
        `🐕 *${t}* lupa ada anjing penjaga di rumah target...`,
        `🦴 GUKGUKGUK! Seluruh kampung terbangun!`,
        `👮 Polisi kebagian laporan, *${t}* kena tilang!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (denda polisi) 👮`
    ],
    (t, fine) => [
        `📱 *${t}* tidak sadar HP-nya masih tersambung GPS...`,
        `🗺️ Polisi bisa lacak lokasi real-time!`,
        `🚔 Dalam 5 menit, sudah dikepung!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (denda polisi) 👮`
    ],
    (t, fine) => [
        `👟 *${t}* pakai sepatu baru yang bunyi KRIUK KRIUK...`,
        `😴 Target yang tadinya tidur langsung terbangun!`,
        `📞 Lapor polisi! *${t}* ketangkap basah!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (denda polisi) 👮`
    ],
]

// ── Skenario GAGAL — dihajar target ──────────────────────────────────────────
const FAIL_TARGET = [
    (t, v, fine) => [
        `🥊 *${v}* ternyata mantan atlet tinju!`,
        `💥 BAM! *${t}* langsung melayang 3 meter!`,
        `🤕 *${t}* kabur sambil megang hidung, uang berceceran!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (dipukul korban) 🥊`
    ],
    (t, v, fine) => [
        `🪃 *${v}* kebetulan lagi pegang wajan panas!`,
        `🔥 KLANGG! Wajan mendarat tepat di kepala *${t}*!`,
        `⭐ *${t}* lihat bintang sebentar, terus kabur!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (kena wajan) 🪃`
    ],
    (t, v, fine) => [
        `😤 *${v}* yang sedang PMS tidak terima digangguin!`,
        `👠 Diserang pakai sendal jepit dengan kecepatan cahaya!`,
        `💨 *${t}* kabur pontang-panting!`,
        `❌ *GAGAL!* -${fmt(fine)} koin (kena sendal) 👠`
    ],
]

// ── Skenario GAGAL — kesialan lain ───────────────────────────────────────────
const FAIL_MISC = [
    (t) => [
        `🌧️ *${t}* terpeleset kulit pisang tepat di depan pintu target...`,
        `🤦 Langsung viral di TikTok tetangga!`,
        `😂 Kabur sambil tertatih-tatih, misi gagal total!`,
        `❌ *GAGAL!* Terpeleset... memalukan sekali 🍌`
    ],
    (t) => [
        `😴 *${t}* ketiduran saat nunggu target pergi...`,
        `😂 Bangun-bangun sudah siang, target ada di rumah!`,
        `🏃 Kabur sambil setengah sadar!`,
        `❌ *GAGAL!* Ketiduran pas maling 😴`
    ],
    (t) => [
        `🤧 *${t}* tiba-tiba bersin keras saat sembunyi di lemari...`,
        `AAACCCHOOOO!!! Seisi rumah dengar!`,
        `😱 Panik, lari banting pintu, ketahuan semua orang!`,
        `❌ *GAGAL!* Ketahuan gara-gara bersin 🤧`
    ],
    (t) => [
        `🔦 *${t}* lupa bawa senter, gelap gulita...`,
        `💡 Nyalain HP buat senter, langsung notif WA bunyi KENCENG!`,
        `😅 Target langsung bangun, *${t}* kabur tanpa hasil!`,
        `❌ *GAGAL!* HP berkhianat 📱`
    ],
    (t) => [
        `🧲 *${t}* bawa magnet besar buat bobol brankas...`,
        `💻 Semua perangkat elektronik target malah rusak duluan!`,
        `😭 Tidak ada yang bisa dicuri, kabur bawa malu!`,
        `❌ *GAGAL!* Salah bawa alat 🧲`
    ],
]

// ── Helper ────────────────────────────────────────────────────────────────────
const fmt   = n => Number(n || 0).toLocaleString('id-ID')
// ── Cari user fleksibel (support @lid, @s.whatsapp.net, lidMap) ──────────────
function findUser(jid) {
    // 1. Coba langsung
    if (getDbUser(jid)) return { user: getDbUser(jid), jid }

    // 2. Cari via lidMap (mapping swa→lid yang disimpan handler)
    const lidMap = global.db.data?.settings?.lidMap || {}
    const mappedLid = lidMap[jid]
    if (mappedLid && getDbUser(mappedLid)) {
        return { user: getDbUser(mappedLid), jid: mappedLid }
    }

    // 3. Scan reverse lidMap: cari @s.whatsapp.net yang mapped ke @lid
    for (const [swaJid, lidJid] of Object.entries(lidMap)) {
        if (lidJid === jid && getDbUser(swaJid)) {
            return { user: getDbUser(swaJid), jid: swaJid }
        }
    }

    // 4. Coba cari nomor HP cocok (hanya untuk @s.whatsapp.net vs @s.whatsapp.net)
    const num = jid.split('@')[0].split(':')[0]
    for (const key of Object.keys(global.db.data.users || {})) {
        if (!false /* keys are numbers now */ && key.split('@')[0].split(':')[0] === num) {
            return { user: global.db.data.users?.[key], jid: key }
        }
    }

    return null
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const pick  = arr => arr[Math.floor(Math.random() * arr.length)]

function formatCooldown(ms) {
    const m = Math.floor(ms / 60000)
    const s = Math.floor((ms % 60000) / 1000)
    return m > 0 ? `${m} menit ${s} detik` : `${s} detik`
}

async function saveDB() {
    try { await global.db.write() } catch (_) {}
}

// ── Riwayat maling per user (simpan di db.settings) ──────────────────────────
function getRiwayat(sender) {
    const key = jidToNum(sender)
    if (!global.db.data.settings.malingLog) global.db.data.settings.malingLog = {}
    if (!global.db.data.settings.malingLog[key]) {
        global.db.data.settings.malingLog[key] = { sukses: 0, gagal: 0, totalCuri: 0, totalDenda: 0 }
    }
    return global.db.data.settings.malingLog[key]
}

// ═══════════════════════════════════════════════════════════════════
//  HANDLER UTAMA
// ═══════════════════════════════════════════════════════════════════
let handler = async (m, { conn, command, args, usedPrefix }) => {
    const cmd    = command.toLowerCase()
    const sender = m.sender
    const user   = getDbUser(sender)
    if (!user) return m.reply('❌ Kamu belum terdaftar! Ketik *.daftar* dulu.')

    // ── .riwayatmaling ────────────────────────────────────────────────────────
    if (/^riwayatmaling$/.test(cmd)) {
        const log = getRiwayat(sender)
        const wr  = log.sukses + log.gagal > 0
            ? ((log.sukses / (log.sukses + log.gagal)) * 100).toFixed(1)
            : '0.0'
        return m.reply(
            `╭─「 🦹 *Riwayat Maling* 」\n│\n` +
            `│  ✅ Sukses  : ${log.sukses}x\n` +
            `│  ❌ Gagal   : ${log.gagal}x\n` +
            `│  📈 Win Rate: ${wr}%\n│\n` +
            `│  💰 Total Curi : ${fmt(log.totalCuri)} koin\n` +
            `│  💸 Total Denda: ${fmt(log.totalDenda)} koin\n│\n` +
            `│  💵 Profit bersih: ${fmt(log.totalCuri - log.totalDenda)} koin\n│\n` +
            `╰─ *.maling @user* untuk beraksi`
        )
    }

    // ── .wanted → top maling ──────────────────────────────────────────────────
    if (/^wanted$/.test(cmd)) {
        const malingLog = global.db.data.settings.malingLog || {}
        const sorted    = Object.entries(malingLog)
            .filter(([, v]) => v.sukses > 0)
            .sort(([, a], [, b]) => b.totalCuri - a.totalCuri)
            .slice(0, 10)

        if (!sorted.length) return m.reply('📭 Belum ada maling yang tercatat!')

        const medals = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟']
        const list   = sorted.map(([jid, v], i) => {
            const num  = jidToNum(jid)
            const name = getDbUser(jid)?.name || num
            return `│  ${medals[i]} *${name}*\n│      💰 ${fmt(v.totalCuri)} | ✅${v.sukses} ❌${v.gagal}`
        }).join('\n│\n')

        return m.reply(
            `╭─「 🚨 *DAFTAR WANTED* 」\n│\n` +
            list + '\n│\n' +
            `╰─ Top maling berdasar total curian`
        )
    }

    // ── .maling @user ─────────────────────────────────────────────────────────
    if (!/^(maling|begal|rampok)$/.test(cmd)) return

    // Cooldown: 10 menit
    const COOLDOWN  = 10 * 60 * 1000
    const lastMaling = user.lastMaling || 0
    const sisaCD    = (lastMaling + COOLDOWN) - Date.now()

    if (sisaCD > 0) return m.reply(
        `⏳ Kamu masih dalam pengawasan polisi!\n` +
        `Tunggu *${formatCooldown(sisaCD)}* lagi.`
    )

    // Validasi target
    // ── AMBIL TARGET ─────────────────────────────
    let rawTarget = null

    if (m.mentionedJid?.length) {
        rawTarget = m.mentionedJid[0]
    } else if (m.quoted?.sender) {
        rawTarget = m.quoted.sender
    } else if (args[0]) {
        rawTarget = args[0]
    }

    if (!rawTarget) return m.reply(
        `🦹 *SISTEM MALING*\n\n` +
        `Cara pakai: *.maling @user*\n` +
        `Atau reply pesan target / pakai nomor: *.maling 628123456789*\n\n` +
        `⚠️ Target harus punya minimal 500 koin\n` +
        `⏰ Cooldown: 10 menit\n\n` +
        `Command lain:\n` +
        `• *.riwayatmaling* — statistik aksimu\n` +
        `• *.wanted* — top 10 maling`
    )

    const users = global.db.data.users || {}
    const lidMap = global.db.data?.settings?.lidMap || {}
    let targetUser = null
    let resolvedTargetJid = null

    function findTarget(jid) {
        if (!jid) return null
        const lidNum = jid.split('@')[0]

        // 1. Cek langsung di DB (gunakan jidToNum agar cocok dengan key nomor HP)
        const numKey = jidToNum(jid)
        if (users[numKey]) return { user: users[numKey], jid: numKey }

        // 2. lidMap[jid] → SWA (lid sebagai key, swa sebagai value)
        const mappedSwa = lidMap[jid]
        if (mappedSwa) {
            const mappedKey = jidToNum(mappedSwa)
            if (users[mappedKey]) return { user: users[mappedKey], jid: mappedKey }
        }

        // 3. Reverse lidMap: cari entry yang valuenya cocok dengan jid
        for (const [lid, swa] of Object.entries(lidMap)) {
            const swaKey = jidToNum(swa)
            const lidKey = jidToNum(lid)
            if ((swa === jid || swaKey === numKey) && users[swaKey]) return { user: users[swaKey], jid: swaKey }
            if ((lid === jid || lidKey === numKey) && users[lidKey]) return { user: users[lidKey], jid: lidKey }
        }

        // 4. Cocokkan angka LID ke semua key di lidMap (angka sebelum @)
        for (const [lid, swa] of Object.entries(lidMap)) {
            if (lid.split('@')[0] === lidNum) {
                // Ketemu di lidMap, cari di DB pakai swa
                if (users[swa]) return { user: users[swa], jid: swa }
                // Atau pakai lid langsung
                if (users[lid]) return { user: users[lid], jid: lid }
            }
        }

        // 5. Cocokkan angka ke semua key DB langsung
        for (const k in users) {
            if (k.split('@')[0].split(':')[0] === lidNum) return { user: users[k], jid: k }
        }

        console.log('[DEBUG] nomor lid:', lidNum, '| ada di DB by nomor:', 
            Object.keys(users).some(k => k.split('@')[0].split(':')[0] === lidNum))
        return null
    }

    // Coba dari mentionedJid
    if (m.mentionedJid?.length) {
        const res = findTarget(m.mentionedJid[0])
        if (res) { targetUser = res.user; resolvedTargetJid = res.jid }
    }

    // Fallback dari reply
    if (!targetUser && m.quoted?.sender) {
        const res = findTarget(m.quoted.sender)
        if (res) { targetUser = res.user; resolvedTargetJid = res.jid }
    }

    // Fallback dari args (input nomor manual)
    if (!targetUser && args[0]) {
        const res = findTarget(args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net')
        if (res) { targetUser = res.user; resolvedTargetJid = res.jid }
    }

    if (!targetUser) {
        console.log('TARGET:', displayForJid(rawTarget) || jidToNum(rawTarget), '| lidMap keys:', Object.keys(lidMap).slice(0,5))
        console.log('DB USERS:', Object.keys(users).map(k => jidToNum(k)).slice(0,20))
        return m.reply('❌ Target tidak terdaftar di database!')
    }

    if (resolvedTargetJid === sender) return m.reply('❌ Tidak bisa maling diri sendiri!')
    if (!targetUser.registered) return m.reply('❌ Target belum daftar!')

    const MIN_TARGET = 500
    if ((targetUser.money || 0) < MIN_TARGET)
        return m.reply(
            `❌ Target terlalu miskin! Minimal punya *${fmt(MIN_TARGET)} koin*\n` +
            `Uang target: *${fmt(targetUser.money)} koin*`
        )

    const thiefName = user.name || sender.split('@')[0]
    const targetName = displayForJid(resolvedTargetJid) || targetUser.name || resolvedTargetJid.split('@')[0]

    // Set cooldown
    user.lastMaling = Date.now()
    await saveDB()

    // ── Kirim "sedang beraksi" dulu ───────────────────────────────────────────
    await m.reply(`🦹 *${thiefName}* sedang beraksi...\n⏳ Tunggu hasilnya...`)
    await sleep(2000)

    // ── Tentukan outcome ──────────────────────────────────────────────────────
    // 45% sukses, 25% kena polisi, 15% dihajar target, 15% kesialan lain
    const roll = Math.random() * 100
    const log  = getRiwayat(sender)

    if (roll < 45) {
        // ── SUKSES ────────────────────────────────────────────────────────────
        // Ambil 10-40% uang target (random)
        const pct    = 0.10 + Math.random() * 0.30
        const amount = Math.floor((targetUser.money || 0) * pct)
        const stolen = Math.max(100, Math.min(amount, 500000)) // cap 500k

        user.money         = (user.money || 0) + stolen
        targetUser.money   = Math.max(0, (targetUser.money || 0) - stolen)
        log.sukses++
        log.totalCuri      += stolen
        // ── Rekam tindakan kriminal ke sistem negara ──────────────
        try {
            const { addCriminalRecord, ensureUserCountryFields } = require('./negara')
            ensureUserCountryFields(user)
            addCriminalRecord(user, 1)
        } catch (_) {}
        await saveDB()

        const scenario = pick(SUCCESS_SCENARIOS)(thiefName, targetName, stolen)

        for (let i = 0; i < scenario.length - 1; i++) {
            await conn.sendMessage(m.chat, { text: scenario[i] }, { quoted: m })
            await sleep(1500)
        }

        return conn.sendMessage(m.chat, {
            text:
                scenario[scenario.length - 1] + '\n\n' +
                `💰 Dicuri: *${fmt(stolen)} koin* (${(pct * 100).toFixed(0)}%)\n` +
                `💵 Saldo kamu: *${fmt(user.money)} koin*\n` +
                `😢 Saldo ${displayForJid(resolvedTargetJid) || resolvedTargetJid.split('@')[0].split(':')[0]}: *${fmt(targetUser.money)} koin*`,
            mentions: [resolvedTargetJid]
        }, { quoted: m })

    } else if (roll < 70) {
        // ── GAGAL: POLISI ─────────────────────────────────────────────────────
        const fine = Math.floor(500 + Math.random() * 2000)
        user.money = Math.max(0, (user.money || 0) - fine)
        log.gagal++
        log.totalDenda += fine
        // ── Denda polisi masuk kas negara ─────────────────────────
        try {
            const { addTaxToTreasury, ensureUserCountryFields, addCriminalRecord } = require('./negara')
            addTaxToTreasury(fine)
            ensureUserCountryFields(user)
            addCriminalRecord(user, 1)
        } catch (_) {}
        await saveDB()

        const scenario = pick(FAIL_POLICE)(thiefName, fine)
        for (let i = 0; i < scenario.length - 1; i++) {
            await conn.sendMessage(m.chat, { text: scenario[i] }, { quoted: m })
            await sleep(1500)
        }

        return conn.sendMessage(m.chat, {
            text:
                scenario[scenario.length - 1] + '\n\n' +
                `💸 Denda: *${fmt(fine)} koin*\n` +
                `💵 Saldo kamu: *${fmt(user.money)} koin*`
        }, { quoted: m })

    } else if (roll < 85) {
        // ── GAGAL: DIHAJAR TARGET ─────────────────────────────────────────────
        const fine = Math.floor(200 + Math.random() * 1000)
        user.money = Math.max(0, (user.money || 0) - fine)
        log.gagal++
        log.totalDenda += fine
        await saveDB()

        const scenario = pick(FAIL_TARGET)(thiefName, targetName, fine)
        for (let i = 0; i < scenario.length - 1; i++) {
            await conn.sendMessage(m.chat, { text: scenario[i] }, { quoted: m })
            await sleep(1500)
        }

        return conn.sendMessage(m.chat, {
            text:
                scenario[scenario.length - 1] + '\n\n' +
                `💸 Biaya rumah sakit: *${fmt(fine)} koin*\n` +
                `💵 Saldo kamu: *${fmt(user.money)} koin*`,
            mentions: [resolvedTargetJid]
        }, { quoted: m })

    } else {
        // ── GAGAL: KESIALAN ───────────────────────────────────────────────────
        log.gagal++
        await saveDB()

        const scenario = pick(FAIL_MISC)(thiefName)
        for (let i = 0; i < scenario.length - 1; i++) {
            await conn.sendMessage(m.chat, { text: scenario[i] }, { quoted: m })
            await sleep(1500)
        }

        return conn.sendMessage(m.chat, {
            text:
                scenario[scenario.length - 1] + '\n\n' +
                `💵 Saldo kamu: *${fmt(user.money)} koin* (tidak berkurang)\n` +
                `_Untung tidak ketahuan polisi!_`
        }, { quoted: m })
    }
}

handler.help    = [
    'maling @user - curi uang user lain',
    'riwayatmaling - statistik aksi maling',
    'wanted - top 10 maling terkaya',
]
handler.tags    = ['rpg', 'game']
handler.command = /^(maling|begal|rampok|riwayatmaling|wanted)$/i
handler.register= true
handler.exp     = 5

module.exports = handler

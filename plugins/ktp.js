const fs = require('fs')
const fetch = require('node-fetch')
const { createCanvas, loadImage } = require('canvas')
const QRCode = require('qrcode')
const { getDbUser } = require('../lib/jidUtils')

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(Number(value) || 0)
}

function generateNik() {
    let nik = ''
    for (let i = 0; i < 11; i++) {
        nik += Math.floor(Math.random() * 10)
    }
    if (nik[0] === '0') nik = '1' + nik.slice(1)
    return nik
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
}

async function createDefaultAvatar(name, size = 320) {
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#cce7ff'
    ctx.fillRect(0, 0, size, size)

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2.2, 0, Math.PI * 2)
    ctx.fill()

    const initials = String(name || 'A').trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'A'
    ctx.fillStyle = '#4287f5'
    ctx.font = `${Math.round(size / 3.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, size / 2, size / 2)
    return canvas
}

async function loadProfileImage(conn, jid, username) {
    try {
        const url = await conn.profilePictureUrl(jid, 'image')
        if (url) {
            const response = await fetch(url)
            if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer())
                return await loadImage(buffer)
            }
        }
    } catch (error) {
        // ignore and fallback to default avatar
    }
    const avatarCanvas = await createDefaultAvatar(username || 'W', 320)
    return await loadImage(avatarCanvas.toBuffer('image/png'))
}

async function createKtpBuffer(user, profileImage) {
    const width = 1200
    const height = 760
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    const totalSaldo = Number(user.money || 0) + Number(user.bank || 0)
    const registeredYear = new Date(user.registeredAt || user.regTime || Date.now()).getFullYear()
    const nik = user.nik
    const fullName = user.name || 'Nama Tidak Diketahui'
    const umur = Number(user.age || 0)
    const saldoText = formatRupiah(totalSaldo)

    // Background
    ctx.fillStyle = '#eaf4ff'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 40)
    ctx.fill()

    // Header bar
    ctx.fillStyle = '#6aa8ff'
    drawRoundedRect(ctx, 40, 40, width - 80, 140, 30)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('KARTU TANDA PENDUDUK', 80, 110)
    ctx.font = '22px sans-serif'
    ctx.fillText('Federasi Tempest', 80, 150)

    // Left profile card
    ctx.fillStyle = '#f4faff'
    drawRoundedRect(ctx, 70, 210, 380, 490, 30)
    ctx.fill()
    ctx.strokeStyle = '#d9e9ff'
    ctx.lineWidth = 4
    ctx.stroke()

    // Profile picture background
    ctx.save()
    ctx.beginPath()
    ctx.arc(260, 360, 150, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(profileImage, 110, 210, 300, 300)
    ctx.restore()

    ctx.fillStyle = '#1d3c77'
    ctx.font = 'bold 30px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(fullName.toUpperCase(), 260, 590)
    ctx.font = '20px sans-serif'
    ctx.fillStyle = '#426bad'
    ctx.fillText(`NIK: ${nik}`, 260, 630)

    // Right detail section
    ctx.fillStyle = '#eef6ff'
    drawRoundedRect(ctx, 470, 210, 660, 490, 30)
    ctx.fill()
    ctx.strokeStyle = '#d9e9ff'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.fillStyle = '#08276f'
    ctx.font = 'bold 34px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('DATA PENDUDUK', 500, 270)

    ctx.fillStyle = '#1f4d91'
    ctx.font = '26px sans-serif'
    const infoStartY = 330
    const lineHeight = 62
    ctx.fillText(`Nama         : ${fullName}`, 500, infoStartY)
    ctx.fillText(`NIK          : ${nik}`, 500, infoStartY + lineHeight)
    ctx.fillText(`Negara       : Federasi Tempest`, 500, infoStartY + lineHeight * 2)
    ctx.fillText(`Umur         : ${umur} Tahun`, 500, infoStartY + lineHeight * 3)
    ctx.fillText(`Pekerjaan    : Nganggur`, 500, infoStartY + lineHeight * 4)
    ctx.fillText(`Saldo        : ${saldoText}`, 500, infoStartY + lineHeight * 5)
    ctx.fillText(`Terdaftar    : ${registeredYear}`, 500, infoStartY + lineHeight * 6)

    // Additional info chips
    const chips = [
        { label: 'ID Penduduk', value: nik },
        { label: 'Status', value: 'Warga Negara Aktif' },
        { label: 'Nomor Kartu', value: nik }
    ]
    const chipY = 700
    let chipX = 500
    ctx.font = '20px sans-serif'
    chips.forEach(chip => {
        const text = `${chip.label}: ${chip.value}`
        const padding = 18
        const textWidth = ctx.measureText(text).width
        const boxWidth = textWidth + padding * 2
        ctx.fillStyle = '#dff0ff'
        drawRoundedRect(ctx, chipX, chipY - 40, boxWidth, 48, 22)
        ctx.fill()
        ctx.fillStyle = '#154a8b'
        ctx.fillText(text, chipX + padding, chipY - 8)
        chipX += boxWidth + 22
    })

    // QR Code
    const qrDataUrl = await QRCode.toDataURL(nik, {
        errorCorrectionLevel: 'H',
        margin: 1,
        color: { dark: '#10427c', light: '#ffffff' }
    })
    const qrImage = await loadImage(qrDataUrl)
    ctx.drawImage(qrImage, 880, 410, 210, 210)
    ctx.fillStyle = '#1d3c77'
    ctx.font = '22px sans-serif'
    ctx.fillText('Scan untuk NIK', 900, 640)

    // Footer
    ctx.fillStyle = '#6aa8ff'
    ctx.fillRect(40, 680, width - 80, 90)
    ctx.fillStyle = '#ffffff'
    ctx.font = '24px sans-serif'
    ctx.fillText(`KTP Digital | Federasi Tempest • ${registeredYear}`, 80, 730)

    return canvas.toBuffer('image/png')
}

let handler = async (m, { conn }) => {
    const user = getDbUser(m.sender)
    if (!user || !user.registered) {
        return m.reply('Anda belum terdaftar sebagai warga negara. Gunakan perintah .daftar terlebih dahulu.')
    }

    if (!user.nik) {
        user.nik = generateNik()
    }
    if (!user.registeredAt) {
        user.registeredAt = new Date(user.regTime || Date.now()).toISOString()
    }
    await global.db.write()

    let profileImage
    try {
        profileImage = await loadProfileImage(conn, m.sender, user.name)
    } catch (error) {
        console.error('[ktp] gagal ambil foto profil:', error)
        profileImage = await loadImage(await createDefaultAvatar(user.name || 'W').toBuffer('image/png'))
    }

    let buffer
    try {
        buffer = await createKtpBuffer(user, profileImage)
    } catch (error) {
        console.error('[ktp] render gagal:', error)
        return m.reply('❌ Gagal membuat KTP. Silakan coba lagi nanti.')
    }

    await conn.sendMessage(m.chat, {
        image: buffer,
        caption: `KTP milik ${user.name}`
    }, { quoted: m })
}

handler.help = ['ktp']
handler.tags = ['main', 'roleplay']
handler.command = /^ktp$/i
handler.exp = 0
handler.register = true
module.exports = handler
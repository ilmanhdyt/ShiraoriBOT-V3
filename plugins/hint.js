let handler = async (m) => {
    global.minigameSessions = global.minigameSessions || {}

    const room = global.minigameSessions[m.chat]

    if (!room)
        return m.reply('❌ Tidak ada minigame yang sedang berlangsung.')

    const userKey = m.sender
        .replace(/@.+/g, '')
        .replace(/:\d+/g, '')

    if (room.player !== userKey)
        return m.reply('❌ Kamu bukan player di game ini.')

    // anti spam hint
    room.hintCount = room.hintCount || 0

    if (room.hintCount >= 3)
        return m.reply('❌ Hint sudah habis.')

    room.hintCount++

    let hintText = ''

    switch (room.type) {

        // ─────────────────────────
        // TEBak ANGKA
        // ─────────────────────────
        case 'angka': {
            const num = Number(room.answer)

            if (room.hintCount === 1)
                hintText = `🔢 Angka lebih ${num > 50 ? 'besar' : 'kecil'} dari 50`

            else if (room.hintCount === 2)
                hintText = `🔢 Angka ${num % 2 === 0 ? 'genap' : 'ganjil'}`

            else
                hintText = `🔢 Digit pertama: ${String(num)[0]}`

            break
        }

        // ─────────────────────────
        // HANGMAN
        // ─────────────────────────
        case 'hangman': {
            const word = room.answer

            if (room.hintCount === 1) {
                hintText = word
                    .split('')
                    .map((v, i) =>
                        i % 2 === 0 ? v : '_'
                    )
                    .join(' ')
            }

            else if (room.hintCount === 2)
                hintText = `🔤 Panjang kata: ${word.length}`

            else
                hintText = `🔤 Huruf awal: ${word[0].toUpperCase()}`

            break
        }

        // ─────────────────────────
        // MATEMATIKA
        // ─────────────────────────
        case 'math': {
            const ans = Number(room.answer)

            if (room.hintCount === 1)
                hintText = `🧮 Jawaban lebih ${ans > 100 ? 'besar' : 'kecil'} dari 100`

            else if (room.hintCount === 2)
                hintText = `🧮 Jawaban ${ans % 2 === 0 ? 'genap' : 'ganjil'}`

            else
                hintText = `🧮 Digit awal: ${String(ans)[0]}`

            break
        }

        // ─────────────────────────
        // EMOJI
        // ─────────────────────────
        case 'emoji': {
            if (room.hint)
                hintText = room.hint

            else
                hintText = `😎 Huruf awal: ${room.answer[0].toUpperCase()}`

            break
        }

        // ─────────────────────────
        // TRIVIA
        // ─────────────────────────
        case 'trivia': {
            if (room.hint)
                hintText = room.hint

            else
                hintText = `🧠 Panjang jawaban: ${room.answer.length}`

            break
        }

        // ─────────────────────────
        // ANAGRAM
        // ─────────────────────────
        case 'anagram': {
            if (room.hint)
                hintText = room.hint

            else {
                hintText = room.answer
                    .split('')
                    .sort(() => Math.random() - 0.5)
                    .join(' ')
            }

            break
        }

        // ─────────────────────────
        // SIAPA AKU
        // ─────────────────────────
        case 'siapakahaku': {
            if (room.hint)
                hintText = room.hint

            else
                hintText = `🕵️ Huruf awal: ${room.answer[0].toUpperCase()}`

            break
        }

        // ─────────────────────────
        // TEBAK KATA
        // ─────────────────────────
        case 'kata': {
            const word = room.answer

            if (room.hintCount === 1)
                hintText = `💬 Huruf awal: ${word[0].toUpperCase()}`

            else if (room.hintCount === 2)
                hintText = `💬 Panjang kata: ${word.length}`

            else {
                hintText = word
                    .split('')
                    .map((v, i) =>
                        i < 2 ? v : '_'
                    )
                    .join(' ')
            }

            break
        }

        default:
            hintText = room.hint || '❌ Hint tidak tersedia.'
    }

    return m.reply(
`💡 *HINT MINIGAME*

${hintText}

📊 Hint digunakan: ${room.hintCount}/3`
    )
}

handler.help = ['hint']
handler.tags = ['game']
handler.command = ['hint']

module.exports = handler
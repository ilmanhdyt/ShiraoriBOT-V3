const findUser = require('./findUser')
const { jidToNum, numToJid } = require('./jidUtils')

function extractNumber(input = '') {
    const digits = String(input).replace(/[^0-9]/g, '')
    return digits || null
}

function resolveTargetUser({
    m,
    args = [],
    conn = null,
    participants = [],
    argIndex = 0,
    candidate = null
}) {
    const rawMention = m?.mentionedJid?.[0] || null
    const rawReply = m?.quoted?.sender || null
    const rawArg = candidate ?? args?.[argIndex] ?? null

    const candidates = [
        { value: rawMention, source: 'mention' },
        { value: rawReply, source: 'reply' },
        { value: rawArg, source: 'text' }
    ].filter(item => item.value)

    for (const item of candidates) {
        const direct = findUser(item.value, participants, conn)
        if (direct?.user) {
            const key = jidToNum(direct.jid)
            return {
                ...item,
                input: item.value,
                jid: numToJid(key),
                key,
                num: key,
                user: direct.user
            }
        }

        const num = extractNumber(item.value)
        if (!num) continue

        const byNumber = findUser(numToJid(num), participants, conn) ||
            findUser(num, participants, conn)

        if (byNumber?.user) {
            const key = jidToNum(byNumber.jid)
            return {
                ...item,
                input: item.value,
                jid: numToJid(key),
                key,
                num: key,
                user: byNumber.user
            }
        }
    }

    return null
}

module.exports = { resolveTargetUser, extractNumber }

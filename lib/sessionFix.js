const fs = require('fs')
const path = require('path')

function cleanupCorruptedSession(
    sessionPath
) {

    if (!fs.existsSync(sessionPath))
        return

    const files =
        fs.readdirSync(sessionPath)

    let deleted = 0

    for (const file of files) {

        const isSessionFile =
            file.startsWith('pre-key') ||
            file.startsWith('session-') ||
            file.includes('app-state') ||
            file.includes('sender-key')

        if (!isSessionFile)
            continue

        const full =
            path.join(sessionPath, file)

        try {

            JSON.parse(
                fs.readFileSync(full)
            )

        } catch {

            try {

                fs.unlinkSync(full)

                deleted++

            } catch {}
        }
    }

    console.log(
`[SESSION] ${deleted} corrupt files deleted`
    )
}

module.exports = {
    cleanupCorruptedSession
}
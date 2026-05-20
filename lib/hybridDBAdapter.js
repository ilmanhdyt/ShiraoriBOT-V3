const fs = require('fs')
const path = require('path')

const ROOT_EXCLUDE_FILES = new Set(['database.json'])
const ROOT_EXCLUDE_DIRS = new Set(['cache'])
const SPLIT_DIR_KEYS = new Set(['users', 'chats', 'economy', 'cooldown', 'heist'])

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function decodeEntryName(file) {
    const ext = path.extname(file)
    const name = ext ? file.slice(0, -ext.length) : file
    try {
        return decodeURIComponent(name)
    } catch (_) {
        return name
    }
}

function encodeEntryName(name) {
    return encodeURIComponent(String(name))
}

async function readJsonFile(file) {
    try {
        const raw = await fs.promises.readFile(file, 'utf8')
        return JSON.parse(raw)
    } catch (err) {
        if (err.code === 'ENOENT') return null
        throw err
    }
}

async function writeJsonFile(file, data) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, JSON.stringify(data, null, 2))
}

async function removeStaleJsonFiles(dir, validNames) {
    let entries = []
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (err) {
        if (err.code === 'ENOENT') return
        throw err
    }

    await Promise.all(entries.map(async entry => {
        if (!entry.isFile() || path.extname(entry.name) !== '.json') return
        if (validNames.has(entry.name)) return
        await fs.promises.unlink(path.join(dir, entry.name)).catch(() => {})
    }))
}

class HybridDBAdapter {
    constructor(baseDir, options = {}) {
        this.baseDir = path.resolve(baseDir)
        this.legacyFile = options.legacyFile ? path.resolve(options.legacyFile) : path.join(this.baseDir, 'database.json')
    }

    async read() {
        await fs.promises.mkdir(this.baseDir, { recursive: true })

        const legacyRaw = await readJsonFile(this.legacyFile)
        const legacyData = isPlainObject(legacyRaw) ? legacyRaw : null
        const rootData = {}
        const splitData = {}
        const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(this.baseDir, entry.name)

            if (entry.isFile()) {
                if (path.extname(entry.name) !== '.json') continue
                if (ROOT_EXCLUDE_FILES.has(entry.name)) continue

                const key = path.basename(entry.name, '.json')
                rootData[key] = await readJsonFile(fullPath)
                continue
            }

            if (!entry.isDirectory()) continue
            if (ROOT_EXCLUDE_DIRS.has(entry.name)) continue

            const files = await fs.promises.readdir(fullPath, { withFileTypes: true })
            const bucket = {}

            for (const file of files) {
                if (!file.isFile() || path.extname(file.name) !== '.json') continue
                const itemKey = decodeEntryName(file.name)
                bucket[itemKey] = await readJsonFile(path.join(fullPath, file.name))
            }

            splitData[entry.name] = bucket
        }

        return {
            ...(isPlainObject(legacyData) ? legacyData : {}),
            ...rootData,
            ...splitData,
        }
    }

    async write(obj) {
        const data = isPlainObject(obj) ? obj : {}
        await fs.promises.mkdir(this.baseDir, { recursive: true })

        const validRootFiles = new Set()
        const handledDirKeys = new Set()

        for (const [key, value] of Object.entries(data)) {
            if (SPLIT_DIR_KEYS.has(key) && isPlainObject(value)) {
                handledDirKeys.add(key)
                const dirPath = path.join(this.baseDir, key)
                await fs.promises.mkdir(dirPath, { recursive: true })

                const validFiles = new Set()
                for (const [entryKey, entryValue] of Object.entries(value)) {
                    const fileName = encodeEntryName(entryKey) + '.json'
                    validFiles.add(fileName)
                    await writeJsonFile(path.join(dirPath, fileName), entryValue)
                }

                await removeStaleJsonFiles(dirPath, validFiles)
                continue
            }

            const fileName = key + '.json'
            validRootFiles.add(fileName)
            await writeJsonFile(path.join(this.baseDir, fileName), value)
        }

        await removeStaleJsonFiles(this.baseDir, validRootFiles)

        for (const dirKey of SPLIT_DIR_KEYS) {
            if (!handledDirKeys.has(dirKey)) {
                await removeStaleJsonFiles(path.join(this.baseDir, dirKey), new Set())
            }
        }
    }
}

module.exports = HybridDBAdapter

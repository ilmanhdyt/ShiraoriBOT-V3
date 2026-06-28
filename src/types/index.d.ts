// src/types/index.d.ts
// JSDoc-compatible TypeScript definitions untuk ShiraoriBOT service layer.
// File ini dipakai oleh editor (VSCode, etc) untuk autocomplete.
// TIDAK di-compile — hanya untuk DX (developer experience).

// ── User ──────────────────────────────────────────────────────────

export interface User {
    registered:    boolean
    name:          string
    money:         number
    bank:          number
    exp:           number
    level:         number
    health:        number
    lastSeen:      number
    inventory:     Record<string, number>
    dailyStreak:   number
    lastDaily:     string
    role:          string
    premium:       boolean
    premiumExpiry: number
    banned:        boolean
    bannedReason:  string
    afk:           number
    afkReason:     string
    married:       boolean
    marriedWith:   string
    lastTransfer:  number
    warn:          number
    limit:         number
    [key: string]: unknown
}

// ── Chat Settings ─────────────────────────────────────────────────

export interface ChatSettings {
    antispam:  boolean
    antilink:  boolean
    antinsfw:  boolean
    welcome:   boolean
    detect:    boolean
    sewa:      boolean
    expired:   number
    game:      boolean
    [key: string]: unknown
}

// ── Global Settings ───────────────────────────────────────────────

export interface GlobalSettings {
    self:        boolean
    autoread:    boolean
    restrict:    boolean
    mading:      boolean
    jadibotMode: boolean
    lidMap:      Record<string, string>
    [key: string]: unknown
}

// ── DatabaseService ───────────────────────────────────────────────

export interface DatabaseService {
    readonly raw:  unknown
    readonly data: DatabaseData
    write(): Promise<void>

    // User
    getUser(id: string): User | null
    ensureUser(id: string): User
    hasUser(id: string): boolean
    updateUser(id: string, patch: Partial<User>): User
    addMoney(id: string, amount: number): number
    deductMoney(id: string, amount: number): { success: boolean; balance: number }
    addExp(id: string, exp: number): { leveled: boolean; oldLevel: number; newLevel: number }
    getAllUsers(): Record<string, User>

    // Chat
    getChat(chatId: string): ChatSettings | null
    ensureChat(chatId: string): ChatSettings
    updateChat(chatId: string, patch: Partial<ChatSettings>): ChatSettings

    // Settings
    getSettings(): GlobalSettings
    updateSettings(patch: Partial<GlobalSettings>): void

    // LID Map
    getLidMap(): Record<string, string>
    setLidEntry(lid: string, jid: string): void
    getLidEntry(lid: string): string | null

    // Maintenance
    sanitizeAllUsers(): { fixed: number; total: number }
}

export interface DatabaseData {
    users?:    Record<string, User>
    chats?:    Record<string, ChatSettings>
    settings?: GlobalSettings
    [key: string]: unknown
}

// ── Services ──────────────────────────────────────────────────────

export interface Services {
    db:     DatabaseService
    logger: Logger
    cache: {
        groupMetadata: unknown | null
    }
}

// ── Logger ────────────────────────────────────────────────────────

export interface Logger {
    debug(msg: string, meta?: Record<string, unknown>): void
    info(msg:  string, meta?: Record<string, unknown>): void
    warn(msg:  string, meta?: Record<string, unknown>): void
    error(msg: string, meta?: Record<string, unknown>): void
    child(prefix: string): Logger
}

// ── Plugin Context ────────────────────────────────────────────────

export interface PluginContext {
    conn:     unknown  // Baileys WASocket
    services: Services
    logger:   Logger
}

// ── Plugin Meta ───────────────────────────────────────────────────

export interface PluginMeta {
    name?:        string
    tags?:        string[]
    cooldown?:    number
    description?: string
    version?:     string
    ownerOnly?:   boolean
    premium?:     boolean
    groupOnly?:   boolean
}

// ── Global augmentation (untuk plugin yang akses global.*) ────────

declare global {
    var dbService:    DatabaseService
    var getUser:      (id: string) => User | null
    var ensureUser:   (id: string) => User
    var updateUser:   (id: string, patch: Partial<User>) => User
    var addMoney:     (id: string, amount: number) => number
    var deductMoney:  (id: string, amount: number) => { success: boolean; balance: number }
    var addExp:       (id: string, exp: number) => { leveled: boolean; oldLevel: number; newLevel: number }
    var saveDb:       () => Promise<void>
}

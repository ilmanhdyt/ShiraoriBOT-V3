const { getDbUser, jidToNum, numToJid } = require('../lib/jidUtils')
// plugins/equip.js — Sistem Equipment RPG
// Command: .equip <sword/armor/ring>  |  .unequip <sword/armor/ring>  |  .equip list

// ── Bonus stat per level equipment ──────────────────────────────
const EQUIP_STATS = {
    sword: { label: '⚔️ Sword',  stat: 'attack',  bonusPerLv: 5,  desc: '+5 Attack per level'  },
    armor: { label: '🛡️ Armor',  stat: 'defense', bonusPerLv: 3,  desc: '+3 Defense & +8 MaxHP per level' },
    ring : { label: '💍 Ring',   stat: 'hp',      bonusPerLv: 5,  desc: '+5 MaxHP per level'    },
}

// Cara dapat equipment:
// sword     → beli di toko (user.sword) atau crafting
// armor     → beli di toko (user.armor) atau crafting
// ring      → crafting (diamond + gold)
// (level equipment dari user.sword, user.armor, user.ring di inventori)

let handler = async (m, { args, usedPrefix }) => {
    const user = getDbUser(m.sender)
    if (!user) throw '❌ Belum terdaftar! Ketik *.daftar nama.umur* dulu.'

    const sub  = (args[0] || '').toLowerCase()
    const item = (args[1] || args[0] || '').toLowerCase()

    // ── LIST ──────────────────────────────────────────────────────
    if (!sub || sub === 'list' || sub === 'info') {
        const lv  = user.level || 1

        const swordOwned   = user.sword    || 0
        const armorOwned   = user.armor    || 0
        const ringOwned    = user.ring     || 0

        const swordEq  = user.equippedSword  || 0
        const armorEq  = user.equippedArmor  || 0
        const ringEq   = user.equippedRing   || 0

        const baseAtk  = 10 + (lv * 2)
        const baseDef  = 5  + (lv * 1)
        const baseHp   = 100 + (lv * 10)

        const totalAtk  = baseAtk + (swordEq * 5)
        const totalDef  = baseDef + (armorEq * 3)
        const totalHp   = baseHp  + (armorEq * 8) + (ringEq * 5)

        return m.reply(`
╭─「 🎒 *EQUIPMENT* 」
│
│  ── 📦 *Inventori Equipment* ──
│  ⚔️ Sword  : ${swordOwned > 0 ? `Lv.${swordOwned} (punya)` : '❌ Belum punya'}
│  🛡️ Armor  : ${armorOwned > 0 ? `Lv.${armorOwned} (punya)` : '❌ Belum punya'}
│  💍 Ring   : ${ringOwned  > 0 ? `Lv.${ringOwned}  (punya)` : '❌ Belum punya'}
│
│  ── ✅ *Terpasang* ──
│  ⚔️ Sword  : ${swordEq ? `Lv.${swordEq} ✅` : '❌ Kosong'}
│  🛡️ Armor  : ${armorEq ? `Lv.${armorEq} ✅` : '❌ Kosong'}
│  💍 Ring   : ${ringEq  ? `Lv.${ringEq}  ✅` : '❌ Kosong'}
│
│  ── 📊 *Total Stat* ──
│  ❤️ Max HP : ${totalHp}
│  ⚔️ Attack : ${totalAtk}
│  🛡️ Defense: ${totalDef}
│
│  💡 *.equip sword* — pasang sword
│  💡 *.unequip armor* — lepas armor
╰─────────────────────────────`.trim())
    }

    // ── UNEQUIP ───────────────────────────────────────────────────
    if (sub === 'unequip' || sub === 'lepas') {
        const target = item === 'sword' ? 'sword'
                     : item === 'armor' ? 'armor'
                     : item === 'ring'  ? 'ring'
                     : null
        if (!target) throw `❌ Item tidak valid! Pilihan: *sword*, *armor*, *ring*`

        const key = `equipped${target.charAt(0).toUpperCase() + target.slice(1)}`
        if (!user[key]) return m.reply(`❌ Kamu tidak sedang memakai ${EQUIP_STATS[target].label}!`)

        user[key] = 0
        await global.db.write()
        return m.reply(`✅ ${EQUIP_STATS[target].label} berhasil dilepas!`)
    }

    // ── EQUIP ─────────────────────────────────────────────────────
    if (sub === 'equip' || sub === 'pasang' || EQUIP_STATS[sub]) {
        const target = EQUIP_STATS[sub] ? sub
                     : item === 'sword' ? 'sword'
                     : item === 'armor' ? 'armor'
                     : item === 'ring'  ? 'ring'
                     : null

        if (!target) throw `❌ Item tidak valid! Pilihan: *sword*, *armor*, *ring*\nContoh: *.equip sword*`

        const owned = user[target] || 0
        if (owned <= 0) return m.reply(`❌ Kamu belum punya ${EQUIP_STATS[target].label}!\nDapatkan lewat *.crafting* atau *.toko*`)

        const key = `equipped${target.charAt(0).toUpperCase() + target.slice(1)}`
        user[key] = owned

        await global.db.write()
        return m.reply(`
✅ *${EQUIP_STATS[target].label} Lv.${owned}* berhasil dipasang!

📊 *Bonus Stat:*
${target === 'sword' ? `⚔️ +${owned * 5} Attack` : ''}${target === 'armor' ? `🛡️ +${owned * 3} Defense\n❤️ +${owned * 8} MaxHP` : ''}${target === 'ring' ? `❤️ +${owned * 5} MaxHP` : ''}

💡 Ketik *.dungeon stat* untuk lihat total stat kamu`.trim())
    }

    return m.reply(`❓ Cara pakai:\n*.equip list* — lihat equipment\n*.equip sword* — pasang sword\n*.unequip armor* — lepas armor`)
}

handler.help     = ['equip', 'unequip']
handler.tags     = ['rpg']
handler.command  = /^(equip|unequip|pasang|lepas)$/i
handler.register = true
handler.exp      = 0

module.exports = handler

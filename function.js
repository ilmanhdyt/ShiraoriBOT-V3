function normalizeJid(jid) {
  if (!jid) return jid
  if (jid.includes('@')) return jid
  return jid + '@s.whatsapp.net'
}

module.exports = { normalizeJid }
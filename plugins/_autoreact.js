let handler = async (m, { conn }) => {
	let emot = conn.pickRandom(["🗿", "👍", "💨", "🩱", "🐷", "🐒", "🤫", "😱", "🤬", "🧐", "😬", "😴", "😳", "🌝", "💩", "👻", "🔥", "🖕"])
    conn.sendMessage(m.chat, {
    	react: {
    		text: emot,
    		key: m.key
    	}
    })	
}
handler.customPrefix = /^(bilek|banh|memek|kontol|mamak|picit|bitch|wibu|pantek|pepek)\b/i
handler.command = new RegExp

module.exports = handler
const utils = require('../utils');
const db = require('../db');

module.exports = {
    match: (msg) => msg.body && msg.body.startsWith('/autoreact'),
    handle: async ({ msg, client, dbPath }) => {
        const commandText = msg.body.substring('/autoreact'.length).trim();

        const args = [];
        const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
        let match;
        while ((match = regex.exec(commandText)) !== null) {
            args.push(match[1] || match[2] || match[3] || '');
        }

        if (args.length < 2 || args.length > 3) {
            await msg.reply('Uso:\n• /autoreact "<grupo|contacto>" <emoji|off>\n• /autoreact "<grupo|contacto>" "<usuario>" <emoji|off>');
            return;
        }

        const recipient = args[0];
        let user = null;
        let emojiOrOff = null;

        if (args.length === 3) {
            user = args[1];
            emojiOrOff = args[2];
        } else {
            emojiOrOff = args[1];
        }

        try {
            let jid;
            if (recipient.includes('@')) {
                jid = recipient;
            } else if (/^\+?[\d\s\-()]+$/.test(recipient)) {
                jid = utils.formatNumberToJid(recipient);
            } else {
                console.log(`[Bot] Resolving chat name for autoreact: "${recipient}"`);
                const chats = await client.getChats();
                const matchingChat = chats.find(chat =>
                    chat.name && chat.name.trim().toLowerCase() === recipient.trim().toLowerCase()
                );

                if (!matchingChat) {
                    throw new Error(`No se encontró ningún chat o grupo llamado "${recipient}"`);
                }
                jid = matchingChat.id._serialized;
                console.log(`[Bot] Resolved chat "${recipient}" to JID for autoreact: ${jid}`);
            }

            db.saveAutoReaction(jid, emojiOrOff, user, dbPath);

            if (user) {
                if (emojiOrOff.toLowerCase() === 'off') {
                    await msg.reply(`❌ Auto-reacción desactivada para el usuario "${user}" en el chat/grupo "${recipient}"`);
                } else {
                    await msg.reply(`✅ Auto-reacción activada con el emoji ${emojiOrOff} para el usuario "${user}" en el chat/grupo "${recipient}"`);
                }
            } else {
                if (emojiOrOff.toLowerCase() === 'off') {
                    await msg.reply(`❌ Auto-reacción desactivada para el chat/grupo "${recipient}"`);
                } else {
                    await msg.reply(`✅ Auto-reacción activada con el emoji ${emojiOrOff} para el chat/grupo "${recipient}"`);
                }
            }
        } catch (error) {
            await msg.reply(`❌ Error: ${error.message}`);
        }
    },
};

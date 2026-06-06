const db = require('../db');

module.exports = {
    match: (msg) => msg.body && msg.body.trim() === '/autoreact list',
    handle: async ({ msg, client, dbPath }) => {
        try {
            const reactions = db.getAutoReactions(dbPath);
            if (Object.keys(reactions).length === 0) {
                await msg.reply('No hay auto-reacciones activas.');
                return;
            }

            let response = '📋 *Auto-reacciones Activas:*\n\n';
            let count = 1;
            for (const [jid, entry] of Object.entries(reactions)) {
                let displayName = jid;
                try {
                    const chat = await client.getChatById(jid);
                    if (chat && chat.name) {
                        displayName = chat.name;
                    }
                } catch (err) {
                    // Fallback to JID if name resolution fails
                }
                if (typeof entry === 'string') {
                    response += `${count}. *Chat:* ${displayName} | *Emoji:* ${entry}\n`;
                } else if (entry && typeof entry === 'object') {
                    response += `${count}. *Chat:* ${displayName}\n`;
                    if (entry.default) {
                        response += `   • *Por defecto:* ${entry.default}\n`;
                    }
                    if (entry.users && Object.keys(entry.users).length > 0) {
                        for (const [user, userEmoji] of Object.entries(entry.users)) {
                            const capitalizedUser = user.charAt(0).toUpperCase() + user.slice(1);
                            response += `   • *${capitalizedUser}:* ${userEmoji}\n`;
                        }
                    }
                }
                count++;
            }
            await msg.reply(response.trim());
        } catch (error) {
            await msg.reply(`❌ Error al listar auto-reacciones: ${error.message}`);
        }
    },
};

const db = require('../db');

module.exports = {
    match: (msg) => !msg.body || !msg.body.startsWith('/'),
    handle: async ({ msg, dbPath }) => {
        const chatJid = msg.fromMe ? msg.to : msg.from;
        const reactions = db.getAutoReactions(dbPath);
        if (!reactions[chatJid]) return;

        const entry = reactions[chatJid];
        let emoji = null;

        if (typeof entry === 'string') {
            emoji = entry;
        } else if (entry && typeof entry === 'object') {
            try {
                const contact = await msg.getContact();
                const senderNumber = contact.number;
                const senderJid = contact.id._serialized;
                const senderName = contact.name ? contact.name.toLowerCase().trim() : null;
                const senderPushname = contact.pushname ? contact.pushname.toLowerCase().trim() : null;

                if (entry.users) {
                    for (const [configuredUser, userEmoji] of Object.entries(entry.users)) {
                        const confUserLower = configuredUser.toLowerCase().trim();
                        if (senderJid === confUserLower ||
                            senderNumber === confUserLower ||
                            (senderName && (senderName === confUserLower || senderName.includes(confUserLower))) ||
                            (senderPushname && (senderPushname === confUserLower || senderPushname.includes(confUserLower)))) {
                            emoji = userEmoji;
                            break;
                        }
                    }
                }
            } catch (contactErr) {
                console.error('[Bot] Error getting contact details for autoreact:', contactErr.message);
            }

            if (!emoji) {
                emoji = entry.default;
            }
        }

        if (emoji && emoji.toLowerCase() !== 'off') {
            try {
                console.log(`[Bot] Auto-reacting with "${emoji}" in chat: ${chatJid}`);
                await msg.react(emoji);
            } catch (err) {
                console.error(`[Bot] Error auto-reacting:`, err.message);
            }
        }
    },
};

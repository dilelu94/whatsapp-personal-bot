const path = require('path');
const fs = require('fs');
const utils = require('../utils');
const db = require('../db');
const scheduler = require('../scheduler');

module.exports = {
    match: (msg) => msg.body && msg.body.startsWith('/schedulemedia'),
    handle: async ({ msg, client, dbPath, mediaDir }) => {
        const regex = /^\/schedulemedia\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+([^\s]+)\s+(\d{1,2}:\d{2})\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))(?:\s+([\s\S]+))?$/;
        const match = msg.body.match(regex);

        if (!match) {
            await msg.reply('Uso: /schedulemedia "<contacto|grupo>" <fecha|hoy|mañana|día> <HH:mm> "<nombre_archivo_o_url>" <mensaje>');
            return;
        }

        const recipient = match[1] || match[2] || match[3];
        const datePart = match[4];
        const timePart = match[5];
        const fileOrUrl = match[6] || match[7] || match[8];
        const body = match[9] || '';

        try {
            let jid;
            if (recipient.includes('@')) {
                jid = recipient;
            } else if (/^\+?[\d\s\-()]+$/.test(recipient)) {
                jid = utils.formatNumberToJid(recipient);
            } else {
                console.log(`[Bot] Resolving chat name for schedulemedia: "${recipient}"`);
                const chats = await client.getChats();
                const matchingChat = chats.find(chat =>
                    chat.name && chat.name.trim().toLowerCase() === recipient.trim().toLowerCase()
                );

                if (!matchingChat) {
                    throw new Error(`No se encontró ningún chat o grupo llamado "${recipient}"`);
                }
                jid = matchingChat.id._serialized;
                console.log(`[Bot] Resolved chat "${recipient}" to JID: ${jid}`);
            }

            const dateObj = utils.parseFutureDate(datePart, timePart);
            if (dateObj.getTime() <= Date.now()) {
                throw new Error('La fecha/hora programada debe ser en el futuro.');
            }

            const isUrl = fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://');
            if (isUrl) {
                try {
                    new URL(fileOrUrl);
                } catch (_) {
                    throw new Error('La URL proporcionada no es válida.');
                }
                try {
                    const res = await utils.fetchWithTimeout(fileOrUrl, { method: 'HEAD' });
                    if (!res.ok) {
                        const resGet = await utils.fetchWithTimeout(fileOrUrl, { method: 'GET' });
                        if (!resGet.ok) {
                            throw new Error(`HTTP status ${resGet.status}`);
                        }
                    }
                } catch (err) {
                    throw new Error(`La URL no es accesible: ${err.message}`);
                }
            } else {
                const resolvedPath = path.resolve(mediaDir, fileOrUrl);
                if (!fs.existsSync(resolvedPath)) {
                    throw new Error(`El archivo local "${fileOrUrl}" no existe en la carpeta media.`);
                }
            }

            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const hours = String(dateObj.getHours()).padStart(2, '0');
            const minutes = String(dateObj.getMinutes()).padStart(2, '0');
            const resolvedDateStr = `${month}-${day}-${year} ${hours}:${minutes}`;

            const savedMessage = db.addMessage({
                to: jid,
                body: body,
                scheduledAt: dateObj.toISOString(),
                mediaUrl: isUrl ? fileOrUrl : null,
                mediaPath: !isUrl ? fileOrUrl : null
            }, dbPath);

            scheduler.scheduleMessage(savedMessage, dbPath);

            await msg.reply(`✅ Archivo multimedia programado con éxito!\n*ID:* ${savedMessage.id}\n*Para:* ${jid}\n*At:* ${resolvedDateStr}`);
        } catch (error) {
            await msg.reply(`❌ Error: ${error.message}`);
        }
    },
};

const utils = require('../utils');
const db = require('../db');
const scheduler = require('../scheduler');

module.exports = {
    match: (msg) => msg.body && msg.body.startsWith('/schedule'),
    handle: async ({ msg, client, dbPath }) => {
        const regex = /^\/schedule\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/;
        const match = msg.body.match(regex);

        if (!match) {
            await msg.reply('Uso: /schedule <nombre_grupo|número> [hoy en <minutos> | en <minutos> | <fecha|hoy|mañana|día> <HH:mm>] <mensaje>');
            return;
        }

        const recipient = match[1] || match[2] || match[3];
        const remaining = match[4];

        try {
            let jid;
            if (recipient.includes('@')) {
                jid = recipient;
            } else if (/^\+?[\d\s\-()]+$/.test(recipient)) {
                jid = utils.formatNumberToJid(recipient);
            } else {
                console.log(`[Bot] Resolving chat name: "${recipient}"`);
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

            let dateObj;
            let body;

            const matchCada = remaining.match(/^cada\s+([^\s]+)\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/i);
            const matchHoyEn = remaining.match(/^hoy\s+en\s+(\d+)\s+([\s\S]+)$/i);
            const matchEn = remaining.match(/^en\s+(\d+)\s+([\s\S]+)$/i);
            const matchDateTime = remaining.match(/^([^\s]+)\s+(\d{1,2}:\d{2})\s+([\s\S]+)$/);

            if (matchCada) {
                const freqRaw = matchCada[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const timePart = matchCada[2];
                body = matchCada[3];

                const [hoursStr, minutesStr] = timePart.split(':');
                const hours = Number(hoursStr);
                const minutes = Number(minutesStr);
                if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    throw new Error('Valores de hora no válidos (debe ser entre 00:00 y 23:59)');
                }
                const timePartNormalized = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

                let isDaily = false;
                let dayOfWeek = null;

                if (freqRaw === 'dia' || freqRaw === 'diario') {
                    isDaily = true;
                } else if (utils.weekdayMap[freqRaw] !== undefined) {
                    dayOfWeek = utils.weekdayMap[freqRaw];
                } else {
                    throw new Error('Frecuencia no válida. Usá "cada dia" o "cada <día_de_semana>" (ej: cada lunes, cada martes).');
                }

                const savedMessage = db.addMessage({
                    to: jid,
                    body: body,
                    status: 'recurring',
                    recurrence: {
                        type: isDaily ? 'daily' : 'weekly',
                        dayOfWeek: dayOfWeek,
                        time: timePartNormalized
                    }
                }, dbPath);

                scheduler.scheduleMessage(savedMessage, dbPath);

                let successMsg;
                if (isDaily) {
                    successMsg = `✅ Mensaje periódico diario programado con éxito!\n*ID:* ${savedMessage.id}\n*Para:* ${recipient}\n*Todos los días a las:* ${timePartNormalized}`;
                } else {
                    const daysInSpanish = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    const dayName = daysInSpanish[dayOfWeek];
                    successMsg = `✅ Mensaje periódico semanal programado con éxito!\n*ID:* ${savedMessage.id}\n*Para:* ${recipient}\n*Todos los ${dayName}s a las:* ${timePartNormalized}`;
                }
                await msg.reply(successMsg);
                return;
            }

            if (matchHoyEn) {
                const minutes = Number(matchHoyEn[1]);
                body = matchHoyEn[2];
                dateObj = new Date(Date.now() + minutes * 60 * 1000);
            } else if (matchEn) {
                const minutes = Number(matchEn[1]);
                body = matchEn[2];
                dateObj = new Date(Date.now() + minutes * 60 * 1000);
            } else if (matchDateTime) {
                const datePart = matchDateTime[1];
                const timePart = matchDateTime[2];
                body = matchDateTime[3];
                dateObj = utils.parseFutureDate(datePart, timePart);
            } else {
                await msg.reply('Uso: /schedule <nombre_grupo|número> [hoy en <minutos> | en <minutos> | <fecha|hoy|mañana|día> <HH:mm> | cada <dia|día_semana> <HH:mm>] <mensaje>');
                return;
            }

            if (dateObj.getTime() <= Date.now()) {
                throw new Error('La fecha/hora programada debe ser en el futuro.');
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
                scheduledAt: dateObj.toISOString()
            }, dbPath);

            scheduler.scheduleMessage(savedMessage, dbPath);

            await msg.reply(`✅ Message scheduled successfully!\n*ID:* ${savedMessage.id}\n*To:* ${jid}\n*At:* ${resolvedDateStr}`);
        } catch (error) {
            await msg.reply(`❌ Error: ${error.message}`);
        }
    },
};

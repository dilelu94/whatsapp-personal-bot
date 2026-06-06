const utils = require('../utils');
const google = require('../google');

module.exports = {
    match: (msg) => msg.body && msg.body.startsWith('/calendar add'),
    handle: async ({ msg }) => {
        const regex = /^\/calendar\s+add\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))\s+([\s\S]+)$/i;
        const match = msg.body.match(regex);
        if (!match) {
            await msg.reply('Uso: /calendar add "<título>" <fecha|hoy|mañana|día> <HH:mm>');
            return;
        }
        const summary = match[1] || match[2] || match[3];
        const remaining = match[4].trim();

        const timeMatch = remaining.match(/^(?:([^\s]+)\s+)?(\d{1,2}:\d{2})$/);
        if (!timeMatch) {
            await msg.reply('Uso: /calendar add "<título>" <fecha|hoy|mañana|día> <HH:mm>');
            return;
        }

        let datePart = timeMatch[1] || 'hoy';
        const timePart = timeMatch[2];

        try {
            const startTime = utils.parseFutureDate(datePart, timePart);
            const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

            const event = await google.createEvent(summary, startTime, endTime);

            const year = startTime.getFullYear();
            const month = String(startTime.getMonth() + 1).padStart(2, '0');
            const day = String(startTime.getDate()).padStart(2, '0');
            const hours = String(startTime.getHours()).padStart(2, '0');
            const minutes = String(startTime.getMinutes()).padStart(2, '0');
            const startTimeStr = `${month}-${day}-${year} ${hours}:${minutes}`;

            await msg.reply(`✅ Evento creado en Google Calendar!\n*Título:* ${event.summary}\n*Fecha/Hora:* ${startTimeStr}`);
        } catch (error) {
            await msg.reply(`❌ Error al crear evento: ${error.message}`);
        }
    },
};

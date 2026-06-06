const google = require('../google');

module.exports = {
    match: (msg) => msg.body && msg.body.trim() === '/calendar hoy',
    handle: async ({ msg }) => {
        try {
            const events = await google.getTodayEvents();
            if (events.length === 0) {
                await msg.reply('📅 No hay eventos agendados para hoy.');
                return;
            }
            let response = '📅 *Eventos de Hoy en Google Calendar:*\n\n';
            let count = 1;
            for (const event of events) {
                const startStr = event.start.dateTime || event.start.date;
                const dateObj = new Date(startStr);
                const timeStr = event.start.dateTime ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : 'Todo el día';
                response += `${count}. *${event.summary}* - ${timeStr}\n`;
                count++;
            }
            await msg.reply(response.trim());
        } catch (error) {
            await msg.reply(`❌ Error al consultar calendario: ${error.message}`);
        }
    },
};

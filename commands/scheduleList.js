const db = require('../db');

module.exports = {
    match: (msg) => msg.body && msg.body.trim() === '/schedule list',
    handle: async ({ msg, client, dbPath }) => {
        try {
            const messages = db.getMessages(dbPath);
            const activeMessages = messages.filter(m => m.status === 'pending' || m.status === 'recurring');

            if (activeMessages.length === 0) {
                await msg.reply('No hay mensajes programados activos o pendientes.');
                return;
            }

            let response = '📋 *Mensajes Programados Activos/Pendientes:*\n\n';
            let count = 1;
            for (const m of activeMessages) {
                let displayName = m.to;
                try {
                    const chat = await client.getChatById(m.to);
                    if (chat && chat.name) {
                        displayName = chat.name;
                    }
                } catch (err) {
                    // Fallback to JID if name resolution fails
                }
                const bodySnippet = m.body.length > 60 ? m.body.substring(0, 57) + '...' : m.body;

                let typeStr = '';
                if (m.status === 'recurring' && m.recurrence) {
                    if (m.recurrence.type === 'daily') {
                        typeStr = `Diario (Todos los días a las ${m.recurrence.time})`;
                    } else if (m.recurrence.type === 'weekly') {
                        const daysInSpanish = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                        const dayName = daysInSpanish[m.recurrence.dayOfWeek];
                        typeStr = `Semanal (Todos los ${dayName}s a las ${m.recurrence.time})`;
                    }
                } else {
                    const dateObj = new Date(m.scheduledAt);
                    const year = dateObj.getFullYear();
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const hours = String(dateObj.getHours()).padStart(2, '0');
                    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
                    typeStr = `Único (${month}-${day}-${year} ${hours}:${minutes})`;
                }

                let mediaInfo = '';
                if (m.mediaUrl) {
                    mediaInfo = `\n   *Multimedia (URL):* ${m.mediaUrl}`;
                } else if (m.mediaPath) {
                    mediaInfo = `\n   *Multimedia (Local):* ${m.mediaPath}`;
                }

                response += `${count}. *ID:* \`${m.id}\` | *Para:* ${displayName}\n   *Tipo:* ${typeStr}${mediaInfo}\n   *Mensaje:* "${bodySnippet}"\n\n`;
                count++;
            }
            await msg.reply(response.trim());
        } catch (error) {
            await msg.reply(`❌ Error al listar programaciones: ${error.message}`);
        }
    },
};

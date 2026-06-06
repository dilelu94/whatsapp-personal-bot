const db = require('../db');
const scheduler = require('../scheduler');

module.exports = {
    match: (msg) => msg.body && msg.body.startsWith('/schedule cancel'),
    handle: async ({ msg, dbPath }) => {
        const matchCancel = msg.body.match(/^\/schedule\s+cancel\s+([^\s]+)$/i);
        if (!matchCancel) {
            await msg.reply('Uso: /schedule cancel <ID>');
            return;
        }

        const idToCancel = matchCancel[1].trim().toLowerCase();
        try {
            const messages = db.getMessages(dbPath);
            const msgToCancel = messages.find(m => m.id.toLowerCase() === idToCancel);

            if (!msgToCancel) {
                await msg.reply(`❌ No se encontró ningún mensaje programado con el ID "${idToCancel}".`);
                return;
            }

            if (msgToCancel.status === 'sent' || msgToCancel.status === 'failed' || msgToCancel.status === 'cancelled') {
                await msg.reply(`❌ El mensaje con ID "${idToCancel}" ya no está activo (estado: ${msgToCancel.status}).`);
                return;
            }

            db.updateMessageStatus(msgToCancel.id, 'cancelled', null, dbPath);

            if (scheduler.activeJobs.has(msgToCancel.id)) {
                scheduler.activeJobs.get(msgToCancel.id).cancel();
                scheduler.activeJobs.delete(msgToCancel.id);
            }

            await msg.reply(`❌ Mensaje programado con ID *${msgToCancel.id}* cancelado correctamente.`);
        } catch (error) {
            await msg.reply(`❌ Error al cancelar: ${error.message}`);
        }
    },
};

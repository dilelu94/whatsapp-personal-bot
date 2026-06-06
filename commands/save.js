const path = require('path');
const fs = require('fs');
const utils = require('../utils');

module.exports = {
    match: (msg) => msg.body && msg.body.trim().startsWith('/save'),
    handle: async ({ msg, mediaDir }) => {
        if (msg.hasMedia) {
            const saveRegex = /^\/save(?:\s+(?:"([^"]+)"|'([^']+)'|([^\s]+)))?$/i;
            const saveMatch = msg.body.trim().match(saveRegex);

            if (!saveMatch) {
                await msg.reply('Uso: /save [nombre_archivo.ext] (enviado como pie de foto/comentario del archivo)');
                return;
            }

            try {
                const media = await msg.downloadMedia();
                if (!media) {
                    throw new Error('No se pudo descargar el archivo multimedia.');
                }

                let filename = saveMatch[1] || saveMatch[2] || saveMatch[3];
                if (filename) {
                    filename = path.basename(filename);
                } else {
                    if (media.filename) {
                        filename = path.basename(media.filename);
                    } else {
                        const ext = utils.getExtensionFromMimeType(media.mimetype) || 'bin';
                        filename = `media_${Date.now()}.${ext}`;
                    }
                }

                const resolvedPath = path.resolve(mediaDir, filename);
                const buffer = Buffer.from(media.data, 'base64');
                fs.writeFileSync(resolvedPath, buffer);

                await msg.reply(`✅ Archivo guardado como ${filename} en el servidor`);
            } catch (error) {
                await msg.reply(`❌ Error al guardar archivo: ${error.message}`);
            }
        } else {
            await msg.reply('❌ Error: Este comando debe enviarse como pie de foto/comentario de un archivo multimedia.');
        }
    },
};

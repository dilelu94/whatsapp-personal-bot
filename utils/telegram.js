const https = require('https');
const fs = require('fs');
const config = require('../config');

// Telegram state tracking
let qrTelegramMessageId = null;
let qrAlertSent = false;
let pairingCodeTelegramMessageId = null;
let pairingCodeAlertSent = false;

/**
 * Sends a generic text alert to Telegram.
 * @param {string} text 
 */
function sendTelegramAlert(text) {
    const { token, chatId } = config.telegram;
    if (!token || !chatId) {
        console.log('[Telegram] Alerta no enviada (falta token o chatId).');
        return;
    }

    const payload = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`[Telegram] Error en la API sendMessage (${res.statusCode}):`, responseBody);
            } else {
                console.log('[Telegram] Alerta enviada con éxito.');
            }
        });
    });

    req.on('error', (err) => {
        console.error('[Telegram] Error en la petición HTTP a Telegram:', err.message);
    });

    req.write(payload);
    req.end();
}

/**
 * Sends a photo to Telegram.
 * @param {string} photoPath 
 * @param {string} caption 
 */
function sendTelegramPhoto(photoPath, caption = '') {
    const { token, chatId } = config.telegram;
    if (!token || !chatId || !fs.existsSync(photoPath)) {
        console.log('[Telegram] Foto no enviada (falta token, chatId o archivo).');
        return;
    }

    try {
        const fileBuffer = fs.readFileSync(photoPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        
        const header = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="photo"; filename="qr.png"\r\n` +
            `Content-Type: image/png\r\n\r\n`;
            
        const footer = `\r\n--${boundary}--\r\n`;

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/sendPhoto`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`[Telegram] Error enviando foto (${res.statusCode}):`, responseBody);
                } else {
                    console.log('[Telegram] Foto enviada con éxito.');
                    try {
                        const parsed = JSON.parse(responseBody);
                        if (parsed.ok && parsed.result) {
                            qrTelegramMessageId = parsed.result.message_id;
                            console.log('[Telegram] Guardado message_id para QR:', qrTelegramMessageId);
                        }
                    } catch (err) {
                        console.error('[Telegram] Error al analizar respuesta de sendPhoto:', err.message);
                    }
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Telegram] Error en la petición HTTP de foto:', err.message);
        });

        req.write(header);
        req.write(fileBuffer);
        req.write(footer);
        req.end();
    } catch (err) {
        console.error('[Telegram] Error al preparar el envío de foto:', err.message);
    }
}

/**
 * Edits an existing photo message in Telegram.
 * @param {number} messageId 
 * @param {string} photoPath 
 * @param {string} caption 
 */
function editTelegramPhoto(messageId, photoPath, caption = '') {
    const { token, chatId } = config.telegram;
    if (!token || !chatId || !messageId || !fs.existsSync(photoPath)) {
        return;
    }

    try {
        const fileBuffer = fs.readFileSync(photoPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        
        const mediaObj = JSON.stringify({
            type: 'photo',
            media: 'attach://photo',
            caption: caption
        });

        const header = 
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="message_id"\r\n\r\n${messageId}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="media"\r\n\r\n${mediaObj}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="photo"; filename="qr.png"\r\n` +
            `Content-Type: image/png\r\n\r\n`;
            
        const footer = `\r\n--${boundary}--\r\n`;

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/editMessageMedia`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => { responseBody += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.error(`[Telegram] Error editando foto (${res.statusCode}):`, responseBody);
                } else {
                    console.log('[Telegram] Foto editada con éxito.');
                }
            });
        });

        req.on('error', (err) => {
            console.error('[Telegram] Error en la petición HTTP de edición de foto:', err.message);
        });

        req.write(header);
        req.write(fileBuffer);
        req.write(footer);
        req.end();
    } catch (err) {
        console.error('[Telegram] Error al preparar la edición de foto:', err.message);
    }
}

/**
 * Sends a pairing code text alert to Telegram.
 * @param {string} text 
 */
function sendTelegramPairingAlert(text) {
    const { token, chatId } = config.telegram;
    if (!token || !chatId) {
        console.log('[Telegram] Alerta de vinculación no enviada (falta token o chatId).');
        return;
    }

    const payload = JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`[Telegram] Error al enviar código de vinculación (${res.statusCode}):`, responseBody);
            } else {
                console.log('[Telegram] Alerta de código de vinculación enviada.');
                try {
                    const parsed = JSON.parse(responseBody);
                    if (parsed.ok && parsed.result) {
                        pairingCodeTelegramMessageId = parsed.result.message_id;
                        console.log('[Telegram] Guardado message_id para vinculación:', pairingCodeTelegramMessageId);
                    }
                } catch (err) {
                    console.error('[Telegram] Error al analizar respuesta de vinculación:', err.message);
                }
            }
        });
    });

    req.on('error', (err) => {
        console.error('[Telegram] Error en la petición HTTP de vinculación:', err.message);
    });

    req.write(payload);
    req.end();
}

/**
 * Edits an existing text message (used for pairing code updates).
 * @param {number} messageId 
 * @param {string} text 
 */
function editTelegramPairingAlert(messageId, text) {
    const { token, chatId } = config.telegram;
    if (!token || !chatId || !messageId) {
        return;
    }

    const payload = JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'Markdown'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/editMessageText`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error(`[Telegram] Error al editar mensaje (${res.statusCode}):`, responseBody);
            } else {
                console.log('[Telegram] Mensaje editado con éxito.');
            }
        });
    });

    req.on('error', (err) => {
        console.error('[Telegram] Error en la petición HTTP de edición de texto:', err.message);
    });

    req.write(payload);
    req.end();
}

/**
 * High-level function to send or update the QR photo alert.
 * @param {string} qrPath 
 * @param {string} text 
 */
function sendOrUpdateQrAlert(qrPath, text) {
    if (!qrAlertSent) {
        sendTelegramPhoto(qrPath, text);
        qrAlertSent = true;
    } else if (qrTelegramMessageId) {
        editTelegramPhoto(qrTelegramMessageId, qrPath, text);
    }
}

/**
 * High-level function to send or update the pairing code alert.
 * @param {string} text 
 */
function sendOrUpdatePairingCodeAlert(text) {
    if (!pairingCodeAlertSent) {
        sendTelegramPairingAlert(text);
        pairingCodeAlertSent = true;
    } else if (pairingCodeTelegramMessageId) {
        editTelegramPairingAlert(pairingCodeTelegramMessageId, text);
    }
}

/**
 * High-level function to update pairing message with success status when client is ready.
 * @param {string} text 
 */
function notifyPairingSuccess(text) {
    if (pairingCodeTelegramMessageId) {
        editTelegramPairingAlert(pairingCodeTelegramMessageId, text);
    }
}

/**
 * Resets alert sent flags and message IDs (e.g. on successful ready or disconnected).
 */
function resetAlertFlags() {
    qrAlertSent = false;
    qrTelegramMessageId = null;
    pairingCodeAlertSent = false;
    pairingCodeTelegramMessageId = null;
}

module.exports = {
    sendTelegramAlert,
    sendTelegramPhoto,
    editTelegramPhoto,
    sendTelegramPairingAlert,
    editTelegramPairingAlert,
    sendOrUpdateQrAlert,
    sendOrUpdatePairingCodeAlert,
    notifyPairingSuccess,
    resetAlertFlags,
    // Export getters/setters for testing/monitoring if needed
    getQrTelegramMessageId: () => qrTelegramMessageId,
    setQrTelegramMessageId: (id) => { qrTelegramMessageId = id; },
    getPairingCodeTelegramMessageId: () => pairingCodeTelegramMessageId,
    setPairingCodeTelegramMessageId: (id) => { pairingCodeTelegramMessageId = id; },
    isQrAlertSent: () => qrAlertSent,
    isPairingCodeAlertSent: () => pairingCodeAlertSent
};

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const utils = require('../utils');

describe('Real WhatsApp Send Test', () => {
    // Set timeout to 300s since user needs time to scan QR code
    jest.setTimeout(300000);

    test.skip('should connect and send exactly one message to the target phone', async () => {
        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        try {
            const readyPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Connection timed out')), 280000);
                client.on('qr', (qr) => {
                    console.log('[Test] Session not authenticated. Please scan this QR code:');
                    const fs = require('fs');
                    fs.writeFileSync('./qrRaw.txt', qr);
                    fs.writeFileSync('./qrUrl.txt', `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
                    
                    qrcode.generate(qr, { small: true }, (qrcodeStr) => {
                        fs.writeFileSync('./qr.txt', qrcodeStr);
                    });
                    qrcode.generate(qr, { small: true });
                });
                client.on('ready', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                client.on('auth_failure', (msg) => {
                    clearTimeout(timeout);
                    reject(new Error('Auth failure: ' + msg));
                });
            });

            await client.initialize();
            await readyPromise;

            const jid = utils.formatNumberToJid('5491100000000');
            const response = await client.sendMessage(jid, 'programado desde la nube');
            
            expect(response).toBeDefined();
            expect(response.id).toBeDefined();
        } finally {
            await client.destroy();
        }
    });
});

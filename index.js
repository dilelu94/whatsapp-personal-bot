const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const scheduler = require('./scheduler');
const google = require('./google');
const { dispatch } = require('./commands');
const config = require('./config');
const telegram = require('./utils/telegram');

// --- Heartbeat / Keep-Alive de conexión ---
let heartbeatInterval = null;

function startHeartbeat(whatsappClient) {
    if (config.nodeEnv === 'test') return; // Omitir durante ejecución de tests

    if (heartbeatInterval) clearInterval(heartbeatInterval);

    // Ejecutar cada 10 minutos (600,000 ms)
    heartbeatInterval = setInterval(async () => {
        try {
            console.log('[Bot] Ejecutando heartbeat de conexión...');

            // 1. Mantener pestaña activa y online
            await whatsappClient.sendPresenceAvailable();

            // 2. Verificar estado de la conexión
            const state = await whatsappClient.getState();
            console.log(`[Bot] Estado verificado por heartbeat: ${state}`);

            if (state !== 'CONNECTED') {
                console.warn(`[Bot] Heartbeat detectó estado de conexión anormal: ${state}. Reiniciando...`);
                telegram.sendTelegramAlert(`⚠️ *ALERTA DE CONEXIÓN DE WHATSAPP*\n\nEl bot detectó un estado de conexión anormal (\`${state}\`). Se reiniciará automáticamente para intentar reconectar.`);
                stopHeartbeat();
                process.exit(1);
            }
        } catch (err) {
            console.error('[Bot] Falló el heartbeat de conexión:', err.message);
            telegram.sendTelegramAlert(`⚠️ *ALERTA DE CONEXIÓN DE WHATSAPP*\n\nEl bot no pudo verificar su estado de conexión (posible congelamiento del navegador). Error: \`${err.message}\`.\n\nSe reiniciará automáticamente.`);
            stopHeartbeat();
            process.exit(1);
        }
    }, 10 * 60 * 1000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('[Bot] Heartbeat de conexión detenido.');
    }
}

// Initialize local database
db.initDatabase(config.dbPath);

// Ensure media directory exists
if (!fs.existsSync(config.mediaDir)) {
    fs.mkdirSync(config.mediaDir, { recursive: true });
}

// Configurar opciones del cliente
const clientOptions = {
    authStrategy: new LocalAuth({
        dataPath: config.wwebjsAuthPath
    }),
    authTimeoutMs: 300000,  // 5 minutes — enough time to scan QR / pair

    puppeteer: {
        headless: 'shell',
        protocolTimeout: 300000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Soporte para Docker
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update'
        ]
    }
};

if (config.telegram.pairingNumber) {
    clientOptions.pairWithPhoneNumber = {
        phoneNumber: config.telegram.pairingNumber.replace(/\D/g, '') // Eliminar caracteres no numéricos
    };
    console.log(`[Bot] Configurado para vinculación por código usando el número: ${clientOptions.pairWithPhoneNumber.phoneNumber}`);
}

// Create WhatsApp Client
const client = new Client(clientOptions);

// Initialize scheduler
scheduler.initScheduler(client);

// QR Code generation event
client.on('qr', (qr) => {
    QRCode.toString(qr, { type: 'terminal', small: true }, (err, str) => {
        console.log('\n=== ESCANEÁ CON WHATSAPP ===');
        console.log('WhatsApp → Ajustes → Dispositivos vinculados → Vincular dispositivo');
        console.log(str);
        console.log('============================\n');
    });
    // Also save as PNG for backup
    const qrPath = path.join(__dirname, 'qr.png');
    QRCode.toFile(qrPath, qr, { width: 400 }, () => {
        // Enviar o actualizar la imagen QR en Telegram
        telegram.sendOrUpdateQrAlert(qrPath, '⚠️ *VINCULACIÓN REQUERIDA*\n\nEl bot de WhatsApp requiere escanear el código QR para iniciar sesión. Por favor escanealo desde esta foto.');
    });
});

// Pairing code event
client.on('code', (code) => {
    console.log('\n=== CÓDIGO DE VINCULACIÓN WHATSAPP ===');
    console.log(`Código: ${code}`);
    console.log('======================================\n');

    const pairingMsg = `🔑 *VINCULACIÓN POR CÓDIGO REQUERIDA*\n\n` +
        `El bot de WhatsApp requiere vinculación. Ingresá este código en tu WhatsApp:\n\n` +
        `👉 \`${code}\` 👈\n\n` +
        `*Pasos:*\n` +
        `1. En tu celular, abrí WhatsApp.\n` +
        `2. Andá a *Ajustes* (o *Configuración*) > *Dispositivos vinculados*.\n` +
        `3. Tocá *Vincular un dispositivo*.\n` +
        `4. Seleccioná *Vincular con el número de teléfono* en la parte inferior.\n` +
        `5. Ingresá el código de 8 caracteres mostrado arriba.`;

    telegram.sendOrUpdatePairingCodeAlert(pairingMsg);
});

// Ready event
client.on('ready', async () => {
    console.log('[Bot] WhatsApp client is ready!');
    console.log('[Bot] Logged in as:', client.info ? client.info.wid.user : 'unknown');
    
    // Si se usó código de vinculación, editar el mensaje con una confirmación
    telegram.notifyPairingSuccess('✅ *DISPOSITIVO VINCULADO CON ÉXITO*\n\nEl bot de WhatsApp se ha vinculado correctamente por código y ya está operativo.');

    // Restablecer banderas al iniciar sesión correctamente
    telegram.resetAlertFlags();
    
    // Delete QR image if it exists
    const qrPath = path.join(__dirname, 'qr.png');
    if (fs.existsSync(qrPath)) {
        fs.unlinkSync(qrPath);
        console.log('[Bot] qr.png deleted.');
    }
    
    // Objeto para reportar mensajes retroactivos/vencidos en el inicio
    const startupReport = { sent: [], expired: [] };

    try {
        const localReport = await scheduler.loadPendingMessages(config.dbPath);
        startupReport.sent.push(...localReport.sent);
        startupReport.expired.push(...localReport.expired);
    } catch (err) {
        console.error('[Bot] Error al cargar mensajes pendientes locales:', err.message);
    }

    // Initialize Google Calendar
    const hasGoogle = google.initGoogleCalendar();
    if (hasGoogle) {
        // Esperar 5 segundos para permitir que la sesión de whatsapp-web.js se estabilice
        // y evitar que client.getChats() se congele en el inicio.
        await new Promise(resolve => setTimeout(resolve, 5000));
        try {
            const syncData = await google.syncCalendarMessages(client, config.google.calendarId, config.dbPath);
            startupReport.sent.push(...syncData.report.sent);
            startupReport.expired.push(...syncData.report.expired);
        } catch (err) {
            console.error('[Bot] Error en la sincronización inicial del calendario:', err.message);
        }

        // Sincronizar cada 10 minutos (600000 ms) - Solo fuera del entorno de prueba
        if (config.nodeEnv !== 'test') {
            setInterval(() => {
                google.syncCalendarMessages(client, config.google.calendarId, config.dbPath).catch(err => {
                    console.error('[Bot] Error en la sincronización periódica del calendario:', err.message);
                });
            }, 10 * 60 * 1000);
        }
    }

    // Generar y enviar reporte consolidado por Telegram
    if (startupReport.sent.length > 0 || startupReport.expired.length > 0) {
        let summaryMsg = '🔄 *Reporte de Inicio de Servidor*\n\n';
        
        if (startupReport.sent.length > 0) {
            summaryMsg += '✅ *Enviados Retroactivamente (últimas 24h):*\n';
            for (const msg of startupReport.sent) {
                let recipientName = msg.to;
                if (msg.to.includes('@')) {
                    try {
                        const chat = await client.getChatById(msg.to);
                        if (chat && chat.name) {
                            recipientName = chat.name;
                        }
                    } catch (_) {}
                }
                const timeStr = new Date(msg.scheduledAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
                summaryMsg += `• *Para:* \`${recipientName}\`\n  *Fecha:* \`${timeStr} (ARG)\`\n  *Mensaje:* "${msg.body}"\n\n`;
            }
        }
        
        if (startupReport.expired.length > 0) {
            summaryMsg += '❌ *Vencidos (más de 24h - No enviados):*\n';
            for (const msg of startupReport.expired) {
                let recipientName = msg.to;
                if (msg.to.includes('@')) {
                    try {
                        const chat = await client.getChatById(msg.to);
                        if (chat && chat.name) {
                            recipientName = chat.name;
                        }
                    } catch (_) {}
                }
                const timeStr = new Date(msg.scheduledAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
                summaryMsg += `• *Para:* \`${recipientName}\`\n  *Fecha:* \`${timeStr} (ARG)\`\n  *Mensaje:* "${msg.body}"\n\n`;
            }
        }
        
        telegram.sendTelegramAlert(summaryMsg);
    }
    // Iniciar el heartbeat de conexión
    startHeartbeat(client);
});

/**
 * Handle incoming WhatsApp messages — dispatches to commands/ modules.
 * @param {Object} msg
 */
async function handleMessage(msg) {
    console.log('[Bot] Message event triggered. Body:', msg.body, 'From:', msg.from, 'To:', msg.to);
    await dispatch({ msg, client, dbPath: config.dbPath, mediaDir: config.mediaDir });
}

// Listen to both incoming messages and self-created messages (for self-scheduling)
client.on('message', handleMessage);
client.on('message_create', handleMessage);

// Handle disconnection event
client.on('disconnected', (reason) => {
    console.warn('[Bot] WhatsApp client was disconnected:', reason);
    stopHeartbeat();
    telegram.sendTelegramAlert(`🛑 *SESIÓN DE WHATSAPP DESCONECTADA*\n\nEl bot se ha desconectado de WhatsApp.\n*Razón:* \`${reason}\`\n\nEl servicio se reiniciará automáticamente para intentar reconectar.`);
    telegram.resetAlertFlags();
    setTimeout(() => {
        process.exit(1);
    }, 5000);
});

// Handle graceful shutdown to clean up Chrome processes
async function gracefulShutdown(signal) {
    console.log(`[Bot] Received ${signal}. Shutting down gracefully...`);
    stopHeartbeat();
    try {
        await client.destroy();
        console.log('[Bot] Client destroyed successfully.');
    } catch (err) {
        console.error('[Bot] Error destroying client during shutdown:', err);
    }
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Clean up stale Chromium lock files if they exist
const sessionDir = path.join(config.wwebjsAuthPath, 'session');
['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(file => {
    const filePath = path.join(sessionDir, file);
    try {
        if (fs.existsSync(filePath) || fs.lstatSync(filePath).isSymbolicLink()) {
            fs.unlinkSync(filePath);
            console.log(`[Bot] Removed stale lock file: ${file}`);
        }
    } catch (err) {
        // Ignore errors
    }
});

// Initialize Client
client.initialize().catch(async (err) => {
    console.error('[Bot] Failed to initialize client:', err);
    try {
        await client.destroy();
        console.log('[Bot] Client destroyed on startup failure.');
    } catch (destroyErr) {
        console.error('[Bot] Failed to destroy client on startup failure:', destroyErr);
    }
    process.exit(1);
});

module.exports = { client };

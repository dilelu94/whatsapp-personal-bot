require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Cargar configuración de Telegram desde pm2-telegram-monitor si está disponible (como fallback)
let telegramConfig = {};
try {
    const monitorConfigPath = path.join(__dirname, '../pm2-telegram-monitor/config.json');
    if (fs.existsSync(monitorConfigPath)) {
        telegramConfig = JSON.parse(fs.readFileSync(monitorConfigPath, 'utf8'));
    }
} catch (err) {
    // ignorar silenciosamente
}

const dbPath = process.env.DB_PATH || path.join(__dirname, 'storage.json');
const wwebjsAuthPath = process.env.WWEBJS_AUTH_PATH || path.join(__dirname, '.wwebjs_auth');
const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, 'media');

module.exports = {
    dbPath,
    wwebjsAuthPath,
    mediaDir,
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN || telegramConfig.botToken,
        chatId: process.env.TELEGRAM_CHAT_ID || telegramConfig.chatId,
        pairingNumber: process.env.WHATSAPP_PAIRING_NUMBER || telegramConfig.whatsappPairingNumber
    },
    google: {
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        credentialsJson: process.env.GOOGLE_CREDENTIALS_JSON || null,
        credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || path.join(__dirname, 'googleCredentials.json')
    },
    nodeEnv: process.env.NODE_ENV || 'development'
};

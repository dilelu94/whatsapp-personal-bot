const readline = require('readline');
const fs = require('fs');
const path = require('path');
const https = require('https');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function testTelegram(token, chatId) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            text: '👋 *¡Prueba de Configuración exitosa!*\n\nTu bot de WhatsApp ya está configurado para enviar alertas a este chat de Telegram.',
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
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, statusCode: res.statusCode, body });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ success: false, error: err.message });
        });

        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log('\n==================================================');
    console.log('🤖  Asistente de Configuración del Bot de WhatsApp  🤖');
    console.log('==================================================\n');

    console.log('Este asistente te guiará para configurar el archivo .env.');
    console.log('Si no deseas configurar Telegram o Google Calendar, simplemente presiona ENTER.\n');

    let telegramToken = '';
    let telegramChatId = '';
    let telegramOk = false;

    while (!telegramOk) {
        telegramToken = (await askQuestion('🤖 Token de tu Bot de Telegram (Bot Token): ')).trim();
        
        if (!telegramToken) {
            console.log('⚠️ Omitiendo configuración de Telegram. No recibirás alertas.');
            break;
        }

        telegramChatId = (await askQuestion('💬 Tu Chat ID de Telegram (ej: 12345678): ')).trim();

        if (!telegramChatId) {
            console.log('❌ El Chat ID es obligatorio si configuras el Token. Inténtalo de nuevo.\n');
            continue;
        }

        console.log('\n🔄 Probando conexión con Telegram...');
        const testResult = await testTelegram(telegramToken, telegramChatId);

        if (testResult.success) {
            console.log('✅ ¡Conexión con Telegram exitosa! Se envió un mensaje de prueba a tu chat.\n');
            telegramOk = true;
        } else {
            console.log('❌ Error al conectar con Telegram.');
            if (testResult.statusCode) {
                console.log(`   Código de respuesta: ${testResult.statusCode}`);
                console.log(`   Detalle: ${testResult.body}`);
            } else if (testResult.error) {
                console.log(`   Error de red: ${testResult.error}`);
            }
            const retry = await askQuestion('\n¿Deseas volver a ingresar las credenciales de Telegram? (s/n): ');
            if (retry.toLowerCase() !== 's') {
                console.log('⚠️ Se guardarán las credenciales de Telegram aunque la prueba haya fallado.');
                break;
            }
            console.log('');
        }
    }

    const pairingNumber = (await askQuestion('📞 Número de WhatsApp para vinculación (Opcional - ej: 5491100000000. Dejar vacío para usar código QR): ')).trim();
    if (pairingNumber) {
        console.log(`✅ Configurado para vincular por código de 8 dígitos con el número: ${pairingNumber.replace(/\D/g, '')}\n`);
    } else {
        console.log('✅ Configurado para vincular mediante escaneo de código QR en consola.\n');
    }

    console.log('--- Integración con Google Calendar (Opcional) ---');
    const calendarId = (await askQuestion('📅 ID de Google Calendar (ENTER para usar "primary"): ')).trim() || 'primary';
    
    console.log('\n¿Tienes las credenciales JSON de Google Cloud Service Account en una sola línea?');
    console.log('(Útil si quieres pegarlas directo en el .env sin crear archivos físicos)');
    const calendarJson = (await askQuestion('🔑 Credenciales JSON (ENTER para omitir y configurar por archivo físico): ')).trim();

    // Generar archivo .env
    let envContent = `# Configuración generada por setup.js\n\n`;
    
    if (telegramToken && telegramChatId) {
        envContent += `TELEGRAM_BOT_TOKEN=${telegramToken}\n`;
        envContent += `TELEGRAM_CHAT_ID=${telegramChatId}\n\n`;
    }

    if (pairingNumber) {
        envContent += `WHATSAPP_PAIRING_NUMBER=${pairingNumber.replace(/\D/g, '')}\n\n`;
    }

    envContent += `GOOGLE_CALENDAR_ID=${calendarId}\n`;
    if (calendarJson) {
        envContent += `GOOGLE_CREDENTIALS_JSON='${calendarJson}'\n`;
    } else {
        envContent += `GOOGLE_CREDENTIALS_PATH=./googleCredentials.json\n`;
    }

    envContent += `\nNODE_ENV=production\n`;

    const envPath = path.join(__dirname, '.env');
    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log('\n==================================================');
    console.log('🎉 ¡Configuración completada con éxito! 🎉');
    console.log('==================================================');
    console.log(`Se ha creado el archivo: ${envPath}\n`);

    if (!calendarJson) {
        console.log('💡 Recuerda: Si vas a usar Google Calendar, guarda tu archivo de credenciales');
        console.log('   como "googleCredentials.json" en la raíz del proyecto.\n');
    }

    console.log('🚀 Para iniciar el bot localmente:');
    console.log('   1. npm start (asegúrate de agregar "start": "node index.js" en package.json)');
    console.log('   o ejecuta: node index.js\n');

    console.log('🐳 Para iniciar usando Docker (recomendado):');
    console.log('   docker compose up -d\n');

    rl.close();
}

main().catch((err) => {
    console.error('Error durante la configuración:', err);
    rl.close();
});

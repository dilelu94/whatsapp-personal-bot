const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const scheduler = require('./scheduler');
const utils = require('./utils');
const config = require('./config');

let calendarClient = null;

/**
 * Initializes Google Calendar client with Service Account credentials.
 * Supports loading credentials from google-credentials.json file or
 * GOOGLE_CREDENTIALS_JSON environment variable.
 * @returns {boolean} True if successfully initialized, false otherwise.
 */
function initGoogleCalendar() {
    let credentials = null;

    if (config.google.credentialsJson) {
        try {
            credentials = JSON.parse(config.google.credentialsJson);
        } catch (e) {
            console.error('[Google] Error al procesar la variable de entorno GOOGLE_CREDENTIALS_JSON:', e.message);
        }
    } else if (fs.existsSync(config.google.credentialsPath)) {
        try {
            credentials = JSON.parse(fs.readFileSync(config.google.credentialsPath, 'utf8'));
        } catch (e) {
            console.error('[Google] Error al leer el archivo googleCredentials.json:', e.message);
        }
    }

    if (!credentials) {
        console.warn('[Google] Credenciales de Google no encontradas. Google Calendar integración desactivada.');
        return false;
    }

    try {
        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
        calendarClient = google.calendar({ version: 'v3', auth });
        console.log('[Google] API de Google Calendar inicializada correctamente.');
        return true;
    } catch (err) {
        console.error('[Google] Error al autenticar con la API de Google Calendar:', err.message);
        return false;
    }
}

/**
 * Lists today's calendar events.
 * @param {string} calendarId 
 * @returns {Promise<Array>} List of events
 */
async function getTodayEvents(calendarId = config.google.calendarId || 'primary') {
    if (!calendarClient) {
        throw new Error('El cliente de Google Calendar no está inicializado.');
    }
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const res = await calendarClient.events.list({
        calendarId,
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
    });
    return res.data.items || [];
}

/**
 * Creates a new event in Google Calendar.
 * @param {string} summary 
 * @param {Date} startTime 
 * @param {Date} endTime 
 * @param {string} calendarId 
 * @returns {Promise<Object>} The created event
 */
async function createEvent(summary, startTime, endTime, calendarId = config.google.calendarId || 'primary') {
    if (!calendarClient) {
        throw new Error('El cliente de Google Calendar no está inicializado.');
    }
    const event = {
        summary,
        start: {
            dateTime: startTime.toISOString()
        },
        end: {
            dateTime: endTime.toISOString()
        }
    };
    const res = await calendarClient.events.insert({
        calendarId,
        resource: event
    });
    return res.data;
}

/**
 * Synchronizes scheduled messages from Calendar events.
 * Scans events in the next 7 days for the pattern: [WA] "recipient" - message
 * @param {Object} client WhatsApp Client
 * @param {string} calendarId 
 * @param {string} dbPath 
 * @returns {Promise<Object>} Summary of sync (added, updated, skipped)
 */
async function syncCalendarMessages(client, calendarId = config.google.calendarId || 'primary', dbPath) {
    if (!calendarClient) {
        throw new Error('El cliente de Google Calendar no está inicializado.');
    }

    console.log(`[Google Sync] Iniciando sincronización de calendario para: ${calendarId}`);

    // Fetch events starting from 24 hours ago up to 7 days in the future
    const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    let res;
    try {
        res = await calendarClient.events.list({
            calendarId,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: 'startTime'
        });
    } catch (err) {
        console.error(`[Google Sync] Error en la API de Google Calendar:`, err.message);
        throw err;
    }

    const items = res.data.items || [];
    const results = { added: 0, updated: 0, skipped: 0, errors: 0 };
    const report = { sent: [], expired: [] };

    const waEventRegex = /^\[WA\]\s*(?:"([^"]+)"|'([^']+)'|([^\s\-]+))\s*-\s*([\s\S]+)$/i;

    const dbMessages = db.getMessages(dbPath);

    for (const event of items) {
        if (!event.summary) continue;

        const match = event.summary.match(waEventRegex);
        if (!match) continue;

        console.log(`[Google Sync] Evento coincidente [WA] encontrado: "${event.summary}"`);

        const recipient = match[1] || match[2] || match[3];
        const body = match[4];
        
        // Google calendar events always have start.dateTime (or start.date for all-day events)
        const scheduledTimeStr = event.start.dateTime || event.start.date;
        if (!scheduledTimeStr) continue;

        const scheduledTime = new Date(scheduledTimeStr);

        // Skip events older than 24 hours
        if (scheduledTime.getTime() <= Date.now() - 24 * 60 * 60 * 1000) {
            results.skipped++;
            // Only add to report.expired if it was not already synchronized
            const existingMsg = dbMessages.find(m => m.calendarEventId === event.id);
            if (!existingMsg) {
                report.expired.push({ to: recipient, body: body, scheduledAt: scheduledTime.toISOString() });
            }
            continue;
        }

        const existingMsg = dbMessages.find(m => m.calendarEventId === event.id);

        if (existingMsg) {
            // If the event exists but is already sent/failed/cancelled, we do not touch it
            if (existingMsg.status !== 'pending') {
                results.skipped++;
                continue;
            }

            const existingTime = new Date(existingMsg.scheduledAt).getTime();
            const newTime = scheduledTime.getTime();

            // If time or message body changed, update it
            if (existingTime !== newTime || existingMsg.body !== body) {
                try {
                    db.updateMessageDetails(existingMsg.id, {
                        body: body,
                        scheduledAt: scheduledTime.toISOString()
                    }, dbPath);

                    // Re-schedule in active jobs
                    if (scheduler.activeJobs.has(existingMsg.id)) {
                        scheduler.activeJobs.get(existingMsg.id).cancel();
                        scheduler.activeJobs.delete(existingMsg.id);
                    }

                    // Reload the updated message object to schedule it
                    const updatedMsg = db.getMessages(dbPath).find(m => m.id === existingMsg.id);
                    
                    if (scheduledTime.getTime() <= Date.now()) {
                        console.log(`[Google Sync] Enviando retroactivamente evento actualizado ${existingMsg.id}...`);
                        await scheduler.sendScheduledMessage(updatedMsg, dbPath);
                        report.sent.push({ to: recipient, body: body, scheduledAt: scheduledTime.toISOString() });
                        results.updated++;
                    } else {
                        scheduler.scheduleMessage(updatedMsg, dbPath);
                        results.updated++;
                    }

                    console.log(`[Google Sync] Evento de Calendario actualizado. ID: ${existingMsg.id}, Nuevo Horario: ${scheduledTime.toISOString()}`);
                } catch (err) {
                    console.error(`[Google Sync] Error al actualizar mensaje ${existingMsg.id}:`, err.message);
                    results.errors++;
                }
            } else {
                results.skipped++;
            }
        } else {
            // New event, parse recipient JID
            try {
                let jid;
                if (recipient.includes('@')) {
                    jid = recipient;
                } else if (/^\+?[\d\s\-()]+$/.test(recipient)) {
                    jid = utils.formatNumberToJid(recipient);
                } else {
                    const chats = await utils.promiseWithTimeout(client.getChats(), 15000, 'Obtener chats de WhatsApp expiró (timeout)');
                    const matchingChat = chats.find(c => c.name && c.name.trim().toLowerCase() === recipient.trim().toLowerCase());
                    if (!matchingChat) {
                        throw new Error(`No se encontró el chat o grupo "${recipient}"`);
                    }
                    jid = matchingChat.id._serialized;
                }

                const savedMsg = db.addMessage({
                    to: jid,
                    body: body,
                    scheduledAt: scheduledTime.toISOString(),
                    status: 'pending'
                }, dbPath);

                // Update with calendarEventId
                db.updateMessageDetails(savedMsg.id, { calendarEventId: event.id }, dbPath);

                // Load complete updated message to schedule it
                const completeMsg = db.getMessages(dbPath).find(m => m.id === savedMsg.id);
                
                if (scheduledTime.getTime() <= Date.now()) {
                    console.log(`[Google Sync] Enviando retroactivamente nuevo evento de calendario ${savedMsg.id}...`);
                    await scheduler.sendScheduledMessage(completeMsg, dbPath);
                    report.sent.push({ to: recipient, body: body, scheduledAt: scheduledTime.toISOString() });
                    results.added++;
                } else {
                    scheduler.scheduleMessage(completeMsg, dbPath);
                    results.added++;
                }

                console.log(`[Google Sync] Nuevo mensaje programado desde Calendario. ID: ${savedMsg.id}, Para: ${jid}, Horario: ${scheduledTime.toISOString()}`);
            } catch (err) {
                console.error(`[Google Sync] Error al programar mensaje para "${recipient}" desde evento ${event.id}:`, err.message);
                results.errors++;
            }
        }
    }

    console.log('[Google Sync] Sincronización finalizada. Resultados:', results);
    return { results, report };
}

module.exports = {
    initGoogleCalendar,
    getTodayEvents,
    createEvent,
    syncCalendarMessages,
    getCalendarClient: () => calendarClient,
    setCalendarClient: (client) => { calendarClient = client; } // useful for mocking in tests
};

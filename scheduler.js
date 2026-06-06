const schedule = require('node-schedule');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const utils = require('./utils');

let whatsappClient = null;
const activeJobs = new Map();

/**
 * Initializes the scheduler with the WhatsApp client.
 * @param {Object} client 
 */
function initScheduler(client) {
    whatsappClient = client;
}

/**
 * Sends a scheduled message immediately.
 * @param {Object} messageObj 
 * @param {string} [dbPath] 
 */
async function sendScheduledMessage(messageObj, dbPath) {
    if (!whatsappClient) {
        throw new Error('Scheduler is not initialized with a WhatsApp client');
    }
    try {
        console.log(`[Scheduler] Sending message ${messageObj.id} to ${messageObj.to}...`);
        if (messageObj.mediaUrl || messageObj.mediaPath) {
            const { MessageMedia } = require('whatsapp-web.js');
            let media;
            if (messageObj.mediaUrl) {
                const response = await utils.fetchWithTimeout(messageObj.mediaUrl);
                if (!response.ok) {
                    throw new Error(`Failed to download media from URL: ${messageObj.mediaUrl} (HTTP status ${response.status})`);
                }
                const contentType = response.headers.get('content-type') || messageObj.mediaMimeType || 'application/octet-stream';
                const buffer = Buffer.from(await response.arrayBuffer());
                const base64 = buffer.toString('base64');
                let filename = 'file';
                try {
                    const urlPathname = new URL(messageObj.mediaUrl).pathname;
                    filename = path.basename(urlPathname) || 'file';
                } catch (_) {}
                media = new MessageMedia(contentType, base64, filename);
            } else {
                const resolvedPath = path.resolve(__dirname, 'media', messageObj.mediaPath);
                if (!fs.existsSync(resolvedPath)) {
                    throw new Error(`Local media file not found: ${messageObj.mediaPath}`);
                }
                media = MessageMedia.fromFilePath(resolvedPath);
            }
            await whatsappClient.sendMessage(messageObj.to, media, { caption: messageObj.body || '' });
        } else {
            await whatsappClient.sendMessage(messageObj.to, messageObj.body);
        }
        if (messageObj.status !== 'recurring') {
            db.updateMessageStatus(messageObj.id, 'sent', null, dbPath);
        }
    } catch (error) {
        console.error(`[Scheduler] Error sending message ${messageObj.id}:`, error.message);
        if (messageObj.status !== 'recurring') {
            db.updateMessageStatus(messageObj.id, 'failed', error.message, dbPath);
        }
        throw error;
    } finally {
        if (messageObj.status !== 'recurring') {
            activeJobs.delete(messageObj.id);
        }
    }
}

/**
 * Schedules a message to be sent at the specified time.
 * @param {Object} messageObj 
 * @param {string} [dbPath] 
 */
function scheduleMessage(messageObj, dbPath) {
    if (!whatsappClient) {
        throw new Error('Scheduler is not initialized with a WhatsApp client');
    }

    let scheduleRule;
    if (messageObj.status === 'recurring' && messageObj.recurrence) {
        const [hours, minutes] = messageObj.recurrence.time.split(':').map(Number);
        if (messageObj.recurrence.type === 'daily') {
            scheduleRule = { hour: hours, minute: minutes };
        } else if (messageObj.recurrence.type === 'weekly') {
            scheduleRule = { dayOfWeek: messageObj.recurrence.dayOfWeek, hour: hours, minute: minutes };
        }
    } else {
        scheduleRule = new Date(messageObj.scheduledAt);
    }

    const job = schedule.scheduleJob(scheduleRule, async () => {
        try {
            await sendScheduledMessage(messageObj, dbPath);
        } catch (error) {
            // Error already logged and handled inside sendScheduledMessage
        }
    });

    if (job) {
        activeJobs.set(messageObj.id, job);
    }
}

/**
 * Loads pending messages from the database, queueing future ones and sending/marking overdue ones.
 * @param {string} [dbPath] 
 * @returns {Promise<Object>} Object with { sent: Array, expired: Array }
 */
async function loadPendingMessages(dbPath) {
    const messages = db.getMessages(dbPath);
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const report = { sent: [], expired: [] };

    for (const msg of messages) {
        if (msg.status === 'pending') {
            const scheduledTime = new Date(msg.scheduledAt).getTime();
            if (scheduledTime <= now) {
                if (scheduledTime >= oneDayAgo) {
                    console.log(`[Scheduler] Retroactively sending message ${msg.id} (scheduled at ${msg.scheduledAt})...`);
                    try {
                        await sendScheduledMessage(msg, dbPath);
                        report.sent.push({ to: msg.to, body: msg.body, scheduledAt: msg.scheduledAt });
                    } catch (err) {
                        console.error(`[Scheduler] Failed to retroactively send message ${msg.id}:`, err.message);
                    }
                } else {
                    db.updateMessageStatus(msg.id, 'failed', 'Missed schedule (bot was offline > 24h)', dbPath);
                    report.expired.push({ to: msg.to, body: msg.body, scheduledAt: msg.scheduledAt });
                }
            } else {
                scheduleMessage(msg, dbPath);
            }
        } else if (msg.status === 'recurring') {
            scheduleMessage(msg, dbPath);
        }
    }
    return report;
}

module.exports = {
    initScheduler,
    scheduleMessage,
    loadPendingMessages,
    sendScheduledMessage,
    activeJobs
};

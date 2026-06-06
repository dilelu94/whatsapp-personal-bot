const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, 'storage.json');

/**
 * Initializes the database file if it does not exist.
 * @param {string} filePath 
 */
function initDatabase(filePath = DEFAULT_DB_PATH) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify({ messages: [] }, null, 2), 'utf8');
    }
}

/**
 * Retrieves all messages from the database.
 * @param {string} filePath 
 * @returns {Array}
 */
function getMessages(filePath = DEFAULT_DB_PATH) {
    initDatabase(filePath);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        return data.messages || [];
    } catch (e) {
        console.error('Error reading database file, returning empty list', e);
        return [];
    }
}

function saveMessages(messages, filePath = DEFAULT_DB_PATH) {
    initDatabase(filePath);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        data.messages = messages;
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving messages to database file, falling back to simple write', e);
        fs.writeFileSync(filePath, JSON.stringify({ messages }, null, 2), 'utf8');
    }
}

/**
 * Adds a new message to the database.
 * @param {Object} msg 
 * @param {string} filePath 
 * @returns {Object} The created message object
 */
function addMessage(msg, filePath = DEFAULT_DB_PATH) {
    const messages = getMessages(filePath);
    
    // Generate a unique ID
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    
    const newMsg = {
        id,
        to: msg.to,
        body: msg.body,
        scheduledAt: msg.scheduledAt !== undefined ? msg.scheduledAt : null,
        status: msg.status || 'pending',
        recurrence: msg.recurrence || null,
        mediaUrl: msg.mediaUrl || null,
        mediaPath: msg.mediaPath || null,
        mediaMimeType: msg.mediaMimeType || null
    };
    
    messages.push(newMsg);
    saveMessages(messages, filePath);
    return newMsg;
}

/**
 * Updates the status (and error, if failed) of a message.
 * @param {string} id 
 * @param {string} status 
 * @param {string|null} errorMsg 
 * @param {string} filePath 
 * @returns {Object} The updated message object
 */
function updateMessageStatus(id, status, errorMsg = null, filePath = DEFAULT_DB_PATH) {
    const messages = getMessages(filePath);
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) {
        throw new Error(`Message with ID ${id} not found`);
    }
    
    messages[msgIndex].status = status;
    if (status === 'failed') {
        messages[msgIndex].error = errorMsg;
    } else {
        delete messages[msgIndex].error;
    }
    
    saveMessages(messages, filePath);
    return messages[msgIndex];
}

/**
 * Retrieves the auto-reactions configuration.
 * @param {string} filePath 
 * @returns {Object} Maps chat JID to emoji
 */
function getAutoReactions(filePath = DEFAULT_DB_PATH) {
    initDatabase(filePath);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        return data.autoReactions || {};
    } catch (e) {
        console.error('Error reading autoReactions from database file', e);
        return {};
    }
}

/**
 * Saves or updates an auto-reaction configuration for a chat.
 * @param {string} chatJid 
 * @param {string} emojiOrOff 
 * @param {string|null} userOrPath 
 * @param {string} filePath 
 */
function saveAutoReaction(chatJid, emojiOrOff, userOrPath = null, filePath = DEFAULT_DB_PATH) {
    let user = null;
    let dbPath = filePath;
    
    if (userOrPath) {
        if (userOrPath.endsWith('.json') || userOrPath.includes('/') || userOrPath.includes('\\')) {
            dbPath = userOrPath;
        } else {
            user = userOrPath;
        }
    }

    initDatabase(dbPath);
    try {
        const content = fs.readFileSync(dbPath, 'utf8');
        const data = JSON.parse(content);
        data.messages = data.messages || [];
        data.autoReactions = data.autoReactions || {};
        
        const isOff = emojiOrOff.toLowerCase() === 'off';
        
        if (user) {
            // User-specific auto-reaction
            let entry = data.autoReactions[chatJid];
            if (typeof entry === 'string') {
                entry = { default: entry, users: {} };
            } else if (!entry) {
                entry = { default: null, users: {} };
            }
            
            if (isOff) {
                if (entry.users) {
                    delete entry.users[user.toLowerCase()];
                }
            } else {
                entry.users = entry.users || {};
                entry.users[user.toLowerCase()] = emojiOrOff;
            }
            
            // Clean up or simplify entry
            const hasUsers = entry.users && Object.keys(entry.users).length > 0;
            if (!hasUsers) {
                if (entry.default !== null) {
                    // Simplify back to a string if there's only the default reaction
                    data.autoReactions[chatJid] = entry.default;
                } else {
                    delete data.autoReactions[chatJid];
                }
            } else {
                data.autoReactions[chatJid] = entry;
            }
        } else {
            // Default auto-reaction for the chat
            if (isOff) {
                delete data.autoReactions[chatJid];
            } else {
                let entry = data.autoReactions[chatJid];
                if (entry && typeof entry === 'object') {
                    // We already have user-specific configurations, update the default field
                    entry.default = emojiOrOff;
                    data.autoReactions[chatJid] = entry;
                } else {
                    // Simple string format since there are no user-specific reactions
                    data.autoReactions[chatJid] = emojiOrOff;
                }
            }
        }
        
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error writing autoReaction to database file', e);
        throw e;
    }
}

/**
 * Updates details of an existing message.
 * @param {string} id 
 * @param {Object} updates 
 * @param {string} filePath 
 * @returns {Object} The updated message object
 */
function updateMessageDetails(id, updates, filePath = DEFAULT_DB_PATH) {
    const messages = getMessages(filePath);
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex === -1) {
        throw new Error(`Message with ID ${id} not found`);
    }
    
    messages[msgIndex] = { ...messages[msgIndex], ...updates };
    saveMessages(messages, filePath);
    return messages[msgIndex];
}

module.exports = {
    initDatabase,
    getMessages,
    addMessage,
    updateMessageStatus,
    updateMessageDetails,
    getAutoReactions,
    saveAutoReaction
};

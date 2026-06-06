/**
 * Formats a given number or JID to the official WhatsApp user JID format.
 * @param {string} number 
 * @returns {string}
 */
function formatNumberToJid(number) {
    if (!number || typeof number !== 'string') {
        throw new Error('Invalid phone number');
    }
    
    // If it's already a formatted JID (user, group, lid, etc.)
    if (number.includes('@')) {
        return number;
    }
    
    // Strip non-digits
    const cleanNumber = number.replace(/\D/g, '');
    if (!cleanNumber) {
        throw new Error('Invalid phone number');
    }
    
    return `${cleanNumber}@c.us`;
}

const weekdayMap = {
    'domingo': 0,
    'lunes': 1,
    'martes': 2,
    'miercoles': 3,
    'miércoles': 3,
    'jueves': 4,
    'viernes': 5,
    'sabado': 6,
    'sábado': 6
};

/**
 * Parses a date string (absolute MM-DD-YYYY or MM-DD, or relative Spanish
 * keywords/weekdays) and a time string (HH:mm) and ensures it is in the future.
 * When MM-DD is used without a year, the year is taken from referenceDate.
 * @param {string} datePart
 * @param {string} [timePart]
 * @param {Date} [referenceDate] Optional reference date (useful for testing)
 * @returns {Date}
 */
function parseFutureDate(datePart, timePart, referenceDate = new Date()) {
    if (!datePart || typeof datePart !== 'string') {
        throw new Error('Invalid date format. Use MM-DD-YYYY, MM-DD, or relative date (hoy, mañana, day of week)');
    }

    // Handle backward compatibility when datePart contains both date and time separated by a space
    if (!timePart) {
        const parts = datePart.trim().split(/\s+/);
        if (parts.length === 2) {
            datePart = parts[0];
            timePart = parts[1];
        } else {
            throw new Error('Invalid date format. Use MM-DD-YYYY HH:mm or MM-DD HH:mm');
        }
    }

    if (!timePart || typeof timePart !== 'string') {
        throw new Error('Invalid time format. Use HH:mm');
    }

    const timeRegex = /^(\d{1,2}):(\d{2})$/;
    const timeMatch = timePart.match(timeRegex);
    if (!timeMatch) {
        throw new Error('Invalid time format. Use HH:mm');
    }
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time values');
    }

    const target = new Date(referenceDate.getTime());
    const cleanDatePart = datePart.trim().toLowerCase();

    if (cleanDatePart === 'hoy') {
        target.setHours(hours, minutes, 0, 0);
    } else if (cleanDatePart === 'mañana' || cleanDatePart === 'manana') {
        target.setDate(target.getDate() + 1);
        target.setHours(hours, minutes, 0, 0);
    } else if (weekdayMap[cleanDatePart] !== undefined) {
        const targetDayNum = weekdayMap[cleanDatePart];
        const currentDayNum = referenceDate.getDay();
        let daysToAdd = (targetDayNum - currentDayNum + 7) % 7;
        
        target.setHours(hours, minutes, 0, 0);
        if (daysToAdd === 0) {
            if (target.getTime() <= referenceDate.getTime()) {
                daysToAdd = 7;
            }
        }
        target.setDate(target.getDate() + daysToAdd);
    } else {
        // Absolute date parsing: MM-DD-YYYY or MM-DD (year defaults to referenceDate)
        const fullDateRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
        const shortDateRegex = /^(\d{1,2})-(\d{1,2})$/;
        const fullMatch = cleanDatePart.match(fullDateRegex);
        const shortMatch = cleanDatePart.match(shortDateRegex);

        let month, day, year;
        if (fullMatch) {
            month = Number(fullMatch[1]);
            day = Number(fullMatch[2]);
            year = Number(fullMatch[3]);
        } else if (shortMatch) {
            month = Number(shortMatch[1]);
            day = Number(shortMatch[2]);
            year = referenceDate.getFullYear();
        } else {
            throw new Error('Invalid date format. Use MM-DD-YYYY, MM-DD, or relative date');
        }

        // Note: month is 0-indexed in Date constructor
        target.setFullYear(year, month - 1, day);
        target.setHours(hours, minutes, 0, 0);
    }

    if (isNaN(target.getTime())) {
        throw new Error('Invalid date/time calculated');
    }

    if (target.getTime() <= referenceDate.getTime()) {
        throw new Error('Date must be in the future');
    }

    return target;
}

const mimeExtensionMap = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip'
};

function getExtensionFromMimeType(mimeType) {
    if (!mimeType) return null;
    const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
    return mimeExtensionMap[cleanMime] || null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(id);
    }
}

function promiseWithTimeout(promise, timeoutMs = 15000, timeoutErrorMsg = 'Operation timed out') {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(timeoutErrorMsg));
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

module.exports = {
    formatNumberToJid,
    parseFutureDate,
    weekdayMap,
    getExtensionFromMimeType,
    fetchWithTimeout,
    promiseWithTimeout
};

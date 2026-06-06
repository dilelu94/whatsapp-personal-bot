const { formatNumberToJid, parseFutureDate } = require('../utils');

describe('utils - formatNumberToJid', () => {
    test('should format clean number string to JID', () => {
        expect(formatNumberToJid('5491112345678')).toBe('5491112345678@c.us');
    });

    test('should strip symbols and spaces and format to JID', () => {
        expect(formatNumberToJid('+54 9 11-1234-5678')).toBe('5491112345678@c.us');
    });

    test('should return already formatted user JID unmodified', () => {
        expect(formatNumberToJid('5491112345678@c.us')).toBe('5491112345678@c.us');
    });

    test('should return already formatted group JID unmodified', () => {
        expect(formatNumberToJid('120363024843194098@g.us')).toBe('120363024843194098@g.us');
    });

    test('should return already formatted lid JID unmodified', () => {
        expect(formatNumberToJid('9247349829794@lid')).toBe('9247349829794@lid');
    });

    test('should throw error for empty or invalid number', () => {
        expect(() => formatNumberToJid('')).toThrow('Invalid phone number');
        expect(() => formatNumberToJid(null)).toThrow('Invalid phone number');
    });
});

describe('utils - parseFutureDate', () => {
    test('should parse valid future date string MM-DD-YYYY HH:mm', () => {
        const futureDateStr = '05-23-2030 15:30';
        const dateObj = parseFutureDate(futureDateStr);
        expect(dateObj).toBeInstanceOf(Date);
        expect(dateObj.getFullYear()).toBe(2030);
        expect(dateObj.getMonth()).toBe(4); // May (0-indexed)
        expect(dateObj.getDate()).toBe(23);
        expect(dateObj.getHours()).toBe(15);
        expect(dateObj.getMinutes()).toBe(30);
    });

    test('should parse valid future date string with single digit month, day, or hours', () => {
        const futureDateStr = '5-3-2030 9:05';
        const dateObj = parseFutureDate(futureDateStr);
        expect(dateObj).toBeInstanceOf(Date);
        expect(dateObj.getFullYear()).toBe(2030);
        expect(dateObj.getMonth()).toBe(4); // May (0-indexed)
        expect(dateObj.getDate()).toBe(3);
        expect(dateObj.getHours()).toBe(9);
        expect(dateObj.getMinutes()).toBe(5);
    });

    test('should parse MM-DD without year using referenceDate year', () => {
        // referenceDate: May 24, 2026
        const refDate = new Date(2026, 4, 24, 15, 30, 0, 0);
        const dateObj = parseFutureDate('06-15', '10:00', refDate);
        expect(dateObj.getFullYear()).toBe(2026);
        expect(dateObj.getMonth()).toBe(5); // June (0-indexed)
        expect(dateObj.getDate()).toBe(15);
        expect(dateObj.getHours()).toBe(10);
    });

    test('should parse MM-DD with single digit components', () => {
        const refDate = new Date(2026, 4, 24, 15, 30, 0, 0);
        const dateObj = parseFutureDate('6-5', '9:05', refDate);
        expect(dateObj.getFullYear()).toBe(2026);
        expect(dateObj.getMonth()).toBe(5);
        expect(dateObj.getDate()).toBe(5);
    });

    test('should throw when MM-DD resolves to a past date in current year', () => {
        const refDate = new Date(2026, 4, 24, 15, 30, 0, 0);
        // January 1 is in the past relative to May 24
        expect(() => parseFutureDate('01-01', '10:00', refDate)).toThrow('Date must be in the future');
    });

    test('should throw error for invalid date format', () => {
        expect(() => parseFutureDate('invalid-date')).toThrow();
        expect(() => parseFutureDate('2030/05/23 15:30')).toThrow();
        // YYYY-MM-DD is no longer accepted
        expect(() => parseFutureDate('2030-05-23 15:30')).toThrow();
    });

    test('should throw error for past date', () => {
        // A date in the past
        expect(() => parseFutureDate('01-01-2020 12:00')).toThrow('Date must be in the future');
    });

    describe('relative dates', () => {
        // Mock referenceDate: Sunday, May 24, 2026 at 15:30:00
        const refDate = new Date(2026, 4, 24, 15, 30, 0, 0);

        test('should parse "hoy" for future time', () => {
            const dateObj = parseFutureDate('hoy', '18:00', refDate);
            expect(dateObj.getFullYear()).toBe(2026);
            expect(dateObj.getMonth()).toBe(4);
            expect(dateObj.getDate()).toBe(24);
            expect(dateObj.getHours()).toBe(18);
            expect(dateObj.getMinutes()).toBe(0);
        });

        test('should throw error for "hoy" with past time', () => {
            expect(() => parseFutureDate('hoy', '12:00', refDate)).toThrow('Date must be in the future');
        });

        test('should parse "mañana" / "manana"', () => {
            const dateObj1 = parseFutureDate('mañana', '10:00', refDate);
            expect(dateObj1.getFullYear()).toBe(2026);
            expect(dateObj1.getMonth()).toBe(4);
            expect(dateObj1.getDate()).toBe(25); // Monday
            expect(dateObj1.getHours()).toBe(10);
            expect(dateObj1.getMinutes()).toBe(0);

            const dateObj2 = parseFutureDate('manana', '10:00', refDate);
            expect(dateObj2.getDate()).toBe(25);
        });

        test('should parse Spanish weekdays in the future (different day)', () => {
            // Monday is next day
            const dateObj1 = parseFutureDate('lunes', '10:00', refDate);
            expect(dateObj1.getDate()).toBe(25);

            // Saturday is May 30
            const dateObj2 = parseFutureDate('sábado', '10:00', refDate);
            expect(dateObj2.getDate()).toBe(30);

            const dateObj3 = parseFutureDate('sabado', '10:00', refDate);
            expect(dateObj3.getDate()).toBe(30);
        });

        test('should parse Spanish weekday matching today with future time (same day)', () => {
            // Today is Sunday (domingo)
            const dateObj = parseFutureDate('domingo', '18:00', refDate);
            expect(dateObj.getDate()).toBe(24); // Remains today
            expect(dateObj.getHours()).toBe(18);
        });

        test('should parse Spanish weekday matching today with past time (next week)', () => {
            // Today is Sunday (domingo), target time is 12:00 (past relative to 15:30)
            const dateObj = parseFutureDate('domingo', '12:00', refDate);
            expect(dateObj.getDate()).toBe(31); // Next Sunday
            expect(dateObj.getHours()).toBe(12);
        });

        test('should handle accents optionally', () => {
            const dateObj1 = parseFutureDate('miércoles', '12:00', refDate);
            expect(dateObj1.getDate()).toBe(27); // Wednesday

            const dateObj2 = parseFutureDate('miercoles', '12:00', refDate);
            expect(dateObj2.getDate()).toBe(27); // Wednesday
        });
    });
});

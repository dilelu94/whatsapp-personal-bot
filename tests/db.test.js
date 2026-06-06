const fs = require('fs');
const path = require('path');
const { initDatabase, getMessages, addMessage, updateMessageStatus, updateMessageDetails, getAutoReactions, saveAutoReaction } = require('../db');

const TEST_DB_PATH = path.join(__dirname, 'test_storage.json');

describe('db.js module', () => {
    beforeEach(() => {
        // Clean up test database file if it exists
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    afterAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    test('should initialize a database file with empty messages if not exists', () => {
        initDatabase(TEST_DB_PATH);
        expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
        const content = JSON.parse(fs.readFileSync(TEST_DB_PATH, 'utf8'));
        expect(content).toEqual({ messages: [] });
    });

    test('should retrieve messages from database', () => {
        initDatabase(TEST_DB_PATH);
        const messages = getMessages(TEST_DB_PATH);
        expect(messages).toEqual([]);
    });

    test('should add a message to database with a unique ID and pending status', () => {
        initDatabase(TEST_DB_PATH);
        const scheduledTime = new Date(Date.now() + 10000).toISOString();
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Hello World',
            scheduledAt: scheduledTime
        }, TEST_DB_PATH);

        expect(msg.id).toBeDefined();
        expect(msg.status).toBe('pending');
        expect(msg.to).toBe('123456789@c.us');
        expect(msg.body).toBe('Hello World');
        expect(msg.scheduledAt).toBe(scheduledTime);
        expect(msg.recurrence).toBeNull();

        const allMsgs = getMessages(TEST_DB_PATH);
        expect(allMsgs).toHaveLength(1);
        expect(allMsgs[0]).toEqual(msg);
    });

    test('should add a recurring message to database with custom status and recurrence rule', () => {
        initDatabase(TEST_DB_PATH);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Daily greetings',
            status: 'recurring',
            recurrence: { type: 'daily', time: '10:00', dayOfWeek: null }
        }, TEST_DB_PATH);

        expect(msg.id).toBeDefined();
        expect(msg.status).toBe('recurring');
        expect(msg.to).toBe('123456789@c.us');
        expect(msg.body).toBe('Daily greetings');
        expect(msg.scheduledAt).toBeNull();
        expect(msg.recurrence).toEqual({ type: 'daily', time: '10:00', dayOfWeek: null });

        const allMsgs = getMessages(TEST_DB_PATH);
        expect(allMsgs).toHaveLength(1);
        expect(allMsgs[0]).toEqual(msg);
    });

    test('should update message status in database', () => {
        initDatabase(TEST_DB_PATH);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Hello World',
            scheduledAt: new Date().toISOString()
        }, TEST_DB_PATH);

        const updated = updateMessageStatus(msg.id, 'sent', null, TEST_DB_PATH);
        expect(updated.status).toBe('sent');

        const allMsgs = getMessages(TEST_DB_PATH);
        expect(allMsgs[0].status).toBe('sent');
    });

    test('should add error message if status is failed', () => {
        initDatabase(TEST_DB_PATH);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Hello World',
            scheduledAt: new Date().toISOString()
        }, TEST_DB_PATH);

        const updated = updateMessageStatus(msg.id, 'failed', 'Connection lost', TEST_DB_PATH);
        expect(updated.status).toBe('failed');
        expect(updated.error).toBe('Connection lost');
    });

    test('should update message details (body, scheduledAt, to) in database', () => {
        initDatabase(TEST_DB_PATH);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Old Body',
            scheduledAt: new Date().toISOString()
        }, TEST_DB_PATH);

        const newTime = new Date(Date.now() + 100000).toISOString();
        const updated = updateMessageDetails(msg.id, {
            body: 'New Body',
            scheduledAt: newTime,
            calendarEventId: 'evt_123'
        }, TEST_DB_PATH);

        expect(updated.body).toBe('New Body');
        expect(updated.scheduledAt).toBe(newTime);
        expect(updated.calendarEventId).toBe('evt_123');

        const allMsgs = getMessages(TEST_DB_PATH);
        expect(allMsgs[0].body).toBe('New Body');
        expect(allMsgs[0].scheduledAt).toBe(newTime);
        expect(allMsgs[0].calendarEventId).toBe('evt_123');
    });

    describe('autoReactions configuration', () => {
        test('should default autoReactions to empty object', () => {
            initDatabase(TEST_DB_PATH);
            const reactions = getAutoReactions(TEST_DB_PATH);
            expect(reactions).toEqual({});
        });

        test('should save and update an autoReaction', () => {
            initDatabase(TEST_DB_PATH);
            saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({ '12345@g.us': '😂' });

            // Update
            saveAutoReaction('12345@g.us', '👍', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({ '12345@g.us': '👍' });
        });

        test('should remove an autoReaction if set to off', () => {
            initDatabase(TEST_DB_PATH);
            saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);
            saveAutoReaction('67890@g.us', '🎉', TEST_DB_PATH);

            saveAutoReaction('12345@g.us', 'off', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({ '67890@g.us': '🎉' });
        });

        test('should save user-specific autoReactions and migrate existing string autoReactions', () => {
            initDatabase(TEST_DB_PATH);
            // 1. Save default reaction
            saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({ '12345@g.us': '😂' });

            // 2. Save user reaction (should migrate chat configuration to object format)
            saveAutoReaction('12345@g.us', '🔥', 'Frank', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({
                '12345@g.us': {
                    default: '😂',
                    users: {
                        frank: '🔥'
                    }
                }
            });

            // 3. Update user reaction
            saveAutoReaction('12345@g.us', '👍', 'Frank', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({
                '12345@g.us': {
                    default: '😂',
                    users: {
                        frank: '👍'
                    }
                }
            });
        });

        test('should simplify back to string format when all user-specific autoReactions are turned off', () => {
            initDatabase(TEST_DB_PATH);
            saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);
            saveAutoReaction('12345@g.us', '🔥', 'Frank', TEST_DB_PATH);

            // Turn off for Frank - should simplify back to string since only default remains
            saveAutoReaction('12345@g.us', 'off', 'Frank', TEST_DB_PATH);
            expect(getAutoReactions(TEST_DB_PATH)).toEqual({ '12345@g.us': '😂' });
        });
    });
});

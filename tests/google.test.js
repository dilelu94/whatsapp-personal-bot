const path = require('path');
const fs = require('fs');
const db = require('../db');
const scheduler = require('../scheduler');
const google = require('../google');

const TEST_DB_PATH = path.join(__dirname, 'test_google_storage.json');

// Mock WhatsApp Client
const mockWhatsAppClient = {
    getChats: jest.fn().mockResolvedValue([
        { id: { _serialized: '5491112345678@c.us' }, name: 'Xiomara' },
        { id: { _serialized: '120363024843194098@g.us' }, name: 'Eventos vapor' }
    ])
};

describe('google.js module', () => {
    let mockCalendarClient;

    beforeEach(() => {
        jest.useFakeTimers();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        db.initDatabase(TEST_DB_PATH);
        scheduler.initScheduler(mockWhatsAppClient);
        
        mockCalendarClient = {
            events: {
                list: jest.fn(),
                insert: jest.fn()
            }
        };
        google.setCalendarClient(mockCalendarClient);
        
        // Clear active jobs
        for (const [id, job] of scheduler.activeJobs.entries()) {
            job.cancel();
            scheduler.activeJobs.delete(id);
        }
    });

    afterEach(() => {
        // Clear active jobs to prevent leaks
        for (const [id, job] of scheduler.activeJobs.entries()) {
            job.cancel();
            scheduler.activeJobs.delete(id);
        }
        jest.useRealTimers();
    });

    afterAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    test('getTodayEvents should query google calendar api with correct bounds', async () => {
        const mockItems = [{ id: '1', summary: 'Meeting' }];
        mockCalendarClient.events.list.mockResolvedValue({ data: { items: mockItems } });

        const events = await google.getTodayEvents('primary');
        expect(events).toEqual(mockItems);
        expect(mockCalendarClient.events.list).toHaveBeenCalledWith(
            expect.objectContaining({
                calendarId: 'primary',
                timeMin: expect.any(String),
                timeMax: expect.any(String),
                singleEvents: true,
                orderBy: 'startTime'
            })
        );
    });

    test('createEvent should insert event to calendar api', async () => {
        const mockEvent = { id: 'evt_new', summary: 'Dentist' };
        mockCalendarClient.events.insert.mockResolvedValue({ data: mockEvent });

        const startTime = new Date(Date.now() + 100000);
        const endTime = new Date(startTime.getTime() + 3600000);

        const created = await google.createEvent('Dentist', startTime, endTime, 'primary');
        expect(created).toEqual(mockEvent);
        expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                calendarId: 'primary',
                resource: expect.objectContaining({
                    summary: 'Dentist',
                    start: { dateTime: startTime.toISOString() },
                    end: { dateTime: endTime.toISOString() }
                })
            })
        );
    });

    test('syncCalendarMessages should parse [WA] events and schedule messages', async () => {
        const futureTime = new Date(Date.now() + 60000); // 1 minute in future
        const mockEventsList = [
            {
                id: 'event_wa_1',
                summary: '[WA] "Xiomara" - Hola Xiomara!',
                start: { dateTime: futureTime.toISOString() }
            },
            {
                id: 'event_normal',
                summary: 'Reunión ordinaria',
                start: { dateTime: futureTime.toISOString() }
            }
        ];
        mockCalendarClient.events.list.mockResolvedValue({ data: { items: mockEventsList } });

        const { results } = await google.syncCalendarMessages(mockWhatsAppClient, 'primary', TEST_DB_PATH);
        expect(results).toEqual({ added: 1, updated: 0, skipped: 0, errors: 0 });

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe('5491112345678@c.us');
        expect(messages[0].body).toBe('Hola Xiomara!');
        expect(messages[0].calendarEventId).toBe('event_wa_1');
        expect(messages[0].status).toBe('pending');

        expect(scheduler.activeJobs.has(messages[0].id)).toBe(true);
    });

    test('syncCalendarMessages should update already scheduled messages if their summary or start time changed', async () => {
        const firstTime = new Date(Date.now() + 60000);
        
        // Pre-insert a pending message with calendarEventId
        const saved = db.addMessage({
            to: '5491112345678@c.us',
            body: 'Old message text',
            scheduledAt: firstTime.toISOString(),
            status: 'pending'
        }, TEST_DB_PATH);
        db.updateMessageDetails(saved.id, { calendarEventId: 'event_wa_2' }, TEST_DB_PATH);

        // Schedule it mock job
        const mockJob = { cancel: jest.fn() };
        scheduler.activeJobs.set(saved.id, mockJob);

        const newTime = new Date(Date.now() + 120000); // 2 minutes in future
        const mockEventsList = [
            {
                id: 'event_wa_2',
                summary: '[WA] "Xiomara" - New message text',
                start: { dateTime: newTime.toISOString() }
            }
        ];
        mockCalendarClient.events.list.mockResolvedValue({ data: { items: mockEventsList } });

        const { results } = await google.syncCalendarMessages(mockWhatsAppClient, 'primary', TEST_DB_PATH);
        expect(results).toEqual({ added: 0, updated: 1, skipped: 0, errors: 0 });

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].body).toBe('New message text');
        expect(new Date(messages[0].scheduledAt).getTime()).toBe(newTime.getTime());

        // Old job should have been cancelled
        expect(mockJob.cancel).toHaveBeenCalled();
        // New job scheduled
        expect(scheduler.activeJobs.has(saved.id)).toBe(true);
    });
});

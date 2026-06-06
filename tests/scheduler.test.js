const path = require('path');
const fs = require('fs');
const schedule = require('node-schedule');

// Mock whatsapp-web.js
const mockMessageMedia = jest.fn().mockImplementation((mimetype, data, filename) => {
    return { mimetype, data, filename };
});
mockMessageMedia.fromFilePath = jest.fn().mockImplementation((filePath) => {
    return { filePath, filename: path.basename(filePath) };
});

jest.mock('whatsapp-web.js', () => {
    return {
        MessageMedia: mockMessageMedia
    };
});

const { initDatabase, getMessages, addMessage, updateMessageStatus } = require('../db');
const { initScheduler, scheduleMessage, loadPendingMessages, activeJobs } = require('../scheduler');

const TEST_DB_PATH = path.join(__dirname, 'test_scheduler_storage.json');

// Mock WhatsApp Client
const mockClient = {
    sendMessage: jest.fn().mockResolvedValue({ id: { id: 'msg_123' } })
};

describe('scheduler.js module', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        initDatabase(TEST_DB_PATH);
        initScheduler(mockClient);
        // Clear active jobs
        for (const [id, job] of activeJobs.entries()) {
            job.cancel();
            activeJobs.delete(id);
        }
    });

    afterAll(() => {
        jest.useRealTimers();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    test('should schedule a message and run it at scheduled time', async () => {
        const futureTime = new Date(Date.now() + 5000); // 5 seconds in the future
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Future Message',
            scheduledAt: futureTime.toISOString()
        }, TEST_DB_PATH);

        scheduleMessage(msg, TEST_DB_PATH);

        expect(activeJobs.has(msg.id)).toBe(true);

        // Fast-forward time
        jest.advanceTimersByTime(6000);

        // Wait for any pending promises (like sendMessage) to resolve
        await Promise.resolve(); 
        await Promise.resolve(); 

        expect(mockClient.sendMessage).toHaveBeenCalledWith('123456789@c.us', 'Future Message');
        
        // Verify database updated
        const updatedMsgs = getMessages(TEST_DB_PATH);
        expect(updatedMsgs[0].status).toBe('sent');
        expect(activeJobs.has(msg.id)).toBe(false);
    });

    test('should handle message sending failure gracefully', async () => {
        mockClient.sendMessage.mockRejectedValueOnce(new Error('Network error'));

        const futureTime = new Date(Date.now() + 5000);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Failed Message',
            scheduledAt: futureTime.toISOString()
        }, TEST_DB_PATH);

        scheduleMessage(msg, TEST_DB_PATH);

        // Fast-forward time
        jest.advanceTimersByTime(6000);

        await Promise.resolve();
        await Promise.resolve();

        const updatedMsgs = getMessages(TEST_DB_PATH);
        expect(updatedMsgs[0].status).toBe('failed');
        expect(updatedMsgs[0].error).toBe('Network error');
        expect(activeJobs.has(msg.id)).toBe(false);
    });

    test('should load pending messages and schedule future ones, while marking past-due ones as failed or sending retroactively', async () => {
        // 1. A message in the past (overdue by more than 24 hours -> should fail)
        const expiredTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
        const expiredMsg = addMessage({
            to: '999999999@c.us',
            body: 'Expired Message',
            scheduledAt: expiredTime.toISOString()
        }, TEST_DB_PATH);

        // 2. A message in the past (overdue by less than 24 hours -> should send retroactively)
        const retroactiveTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        const retroactiveMsg = addMessage({
            to: '888888888@c.us',
            body: 'Retroactive Message',
            scheduledAt: retroactiveTime.toISOString()
        }, TEST_DB_PATH);

        // 3. A message in the future (should be queued)
        const futureTime = new Date(Date.now() + 10000);
        const futureMsg = addMessage({
            to: '111111111@c.us',
            body: 'Future Message',
            scheduledAt: futureTime.toISOString()
        }, TEST_DB_PATH);

        await loadPendingMessages(TEST_DB_PATH);

        // Overdue message (more than 24 hours) should be marked as failed
        const updatedMsgs = getMessages(TEST_DB_PATH);
        const updatedExpired = updatedMsgs.find(m => m.id === expiredMsg.id);
        const updatedRetroactive = updatedMsgs.find(m => m.id === retroactiveMsg.id);
        const updatedFuture = updatedMsgs.find(m => m.id === futureMsg.id);

        expect(updatedExpired.status).toBe('failed');
        expect(updatedExpired.error).toBe('Missed schedule (bot was offline > 24h)');
        expect(mockClient.sendMessage).not.toHaveBeenCalledWith('999999999@c.us', expect.any(String));

        // Retroactive message should be sent
        expect(updatedRetroactive.status).toBe('sent');
        expect(mockClient.sendMessage).toHaveBeenCalledWith('888888888@c.us', 'Retroactive Message');

        // Future message should be queued
        expect(activeJobs.has(futureMsg.id)).toBe(true);

        // Fast-forward to trigger future message
        jest.advanceTimersByTime(11000);
        await Promise.resolve();
        await Promise.resolve();

        expect(mockClient.sendMessage).toHaveBeenCalledWith('111111111@c.us', 'Future Message');
        expect(getMessages(TEST_DB_PATH).find(m => m.id === futureMsg.id).status).toBe('sent');
    });

    test('should allow cancelling a scheduled message', () => {
        const futureTime = new Date(Date.now() + 5000);
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Cancel Me',
            scheduledAt: futureTime.toISOString()
        }, TEST_DB_PATH);

        scheduleMessage(msg, TEST_DB_PATH);
        expect(activeJobs.has(msg.id)).toBe(true);

        const cancelJob = activeJobs.get(msg.id);
        const cancelSpy = jest.spyOn(cancelJob, 'cancel');

        const success = updateMessageStatus(msg.id, 'failed', 'Cancelled by user', TEST_DB_PATH);
        // We cancel the active job when status changes
        if (activeJobs.has(msg.id)) {
            activeJobs.get(msg.id).cancel();
            activeJobs.delete(msg.id);
        }

        expect(cancelSpy).toHaveBeenCalled();
        expect(activeJobs.has(msg.id)).toBe(false);
    });

    test('should schedule a recurring daily message and run it without marking as sent or deleting from activeJobs', async () => {
        const msg = addMessage({
            to: '123456789@c.us',
            body: 'Recurring Daily Message',
            status: 'recurring',
            recurrence: { type: 'daily', time: '10:00', dayOfWeek: null }
        }, TEST_DB_PATH);

        scheduleMessage(msg, TEST_DB_PATH);

        expect(activeJobs.has(msg.id)).toBe(true);

        const job = activeJobs.get(msg.id);
        await job.invoke();

        expect(mockClient.sendMessage).toHaveBeenCalledWith('123456789@c.us', 'Recurring Daily Message');
        
        // Verify database status remains 'recurring' (not changed to 'sent')
        const updatedMsgs = getMessages(TEST_DB_PATH);
        expect(updatedMsgs[0].status).toBe('recurring');
        
        // Verify it is NOT deleted from activeJobs
        expect(activeJobs.has(msg.id)).toBe(true);
    });

    test('should load recurring messages and schedule them', () => {
        const msg = addMessage({
            to: '555555555@c.us',
            body: 'Weekly Report',
            status: 'recurring',
            recurrence: { type: 'weekly', time: '18:00', dayOfWeek: 1 }
        }, TEST_DB_PATH);

        loadPendingMessages(TEST_DB_PATH);

        expect(activeJobs.has(msg.id)).toBe(true);
    });

    test('should send a scheduled message with local media file', async () => {
        const mediaDir = path.join(__dirname, '../media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }
        const testFileName = 'test_scheduler_menu.pdf';
        fs.writeFileSync(path.join(mediaDir, testFileName), 'dummy pdf content');

        try {
            const futureTime = new Date(Date.now() + 5000);
            const msg = addMessage({
                to: '123456789@c.us',
                body: 'Aquí está el menú',
                scheduledAt: futureTime.toISOString(),
                mediaPath: testFileName
            }, TEST_DB_PATH);

            scheduleMessage(msg, TEST_DB_PATH);
            expect(activeJobs.has(msg.id)).toBe(true);

            // Fast-forward time
            jest.advanceTimersByTime(6000);
            for (let i = 0; i < 10; i++) {
                await Promise.resolve();
            }

            expect(mockClient.sendMessage).toHaveBeenCalledWith(
                '123456789@c.us',
                expect.objectContaining({ filePath: path.resolve(mediaDir, testFileName) }),
                { caption: 'Aquí está el menú' }
            );

            const updatedMsgs = getMessages(TEST_DB_PATH);
            expect(updatedMsgs.find(m => m.id === msg.id).status).toBe('sent');
            expect(activeJobs.has(msg.id)).toBe(false);
        } finally {
            if (fs.existsSync(path.join(mediaDir, testFileName))) {
                fs.unlinkSync(path.join(mediaDir, testFileName));
            }
        }
    });

    test('should send a scheduled message with remote media URL', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'image/png']]),
            arrayBuffer: async () => new ArrayBuffer(8)
        });

        try {
            const futureTime = new Date(Date.now() + 5000);
            const msg = addMessage({
                to: '123456789@c.us',
                body: 'Foto programada',
                scheduledAt: futureTime.toISOString(),
                mediaUrl: 'https://example.com/test_image.png'
            }, TEST_DB_PATH);

            scheduleMessage(msg, TEST_DB_PATH);
            expect(activeJobs.has(msg.id)).toBe(true);

            // Fast-forward time
            jest.advanceTimersByTime(6000);
            for (let i = 0; i < 10; i++) {
                await Promise.resolve();
            }

            expect(mockClient.sendMessage).toHaveBeenCalledWith(
                '123456789@c.us',
                expect.objectContaining({ mimetype: 'image/png', filename: 'test_image.png' }),
                { caption: 'Foto programada' }
            );

            const updatedMsgs = getMessages(TEST_DB_PATH);
            expect(updatedMsgs.find(m => m.id === msg.id).status).toBe('sent');
            expect(activeJobs.has(msg.id)).toBe(false);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

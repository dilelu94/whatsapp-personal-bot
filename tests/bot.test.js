const path = require('path');
const fs = require('fs');

// Mock whatsapp-web.js BEFORE requiring index.js
const mockEvents = {};
const mockClientInstance = {
    on: jest.fn((event, callback) => {
        mockEvents[event] = callback;
    }),
    initialize: jest.fn().mockResolvedValue(),
    sendMessage: jest.fn().mockResolvedValue(),
    getChats: jest.fn().mockResolvedValue([]),
    getChatById: jest.fn().mockImplementation((id) => {
        let name = 'Resolved Chat';
        if (id === '12345@g.us') name = 'Eventos vapor';
        if (id === '5491112345678@c.us') name = 'Xiomara';
        return Promise.resolve({ id: { _serialized: id }, name });
    })
};

const mockMessageMedia = jest.fn().mockImplementation((mimetype, data, filename) => {
    return { mimetype, data, filename };
});
mockMessageMedia.fromFilePath = jest.fn().mockImplementation((filePath) => {
    return { filePath, filename: path.basename(filePath) };
});

jest.mock('whatsapp-web.js', () => {
    return {
        Client: jest.fn().mockImplementation(() => mockClientInstance),
        LocalAuth: jest.fn(),
        MessageMedia: mockMessageMedia
    };
});

// Mock qrcode-terminal
jest.mock('qrcode-terminal', () => {
    return {
        generate: jest.fn()
    };
});

// Mock google.js
jest.mock('../google', () => {
    return {
        initGoogleCalendar: jest.fn().mockReturnValue(true),
        getTodayEvents: jest.fn().mockResolvedValue([
            { id: '1', summary: 'Daily Scrum', start: { dateTime: '2026-05-25T10:00:00.000Z' } }
        ]),
        createEvent: jest.fn().mockImplementation((summary, startTime, endTime) => {
            return Promise.resolve({ id: 'evt_123', summary });
        }),
        syncCalendarMessages: jest.fn().mockResolvedValue({ added: 1, updated: 0, skipped: 0, errors: 0 })
    };
});

const TEST_DB_PATH = path.join(__dirname, 'test_bot_storage.json');
// Set environment variable for test DB path so index.js uses it
process.env.DB_PATH = TEST_DB_PATH;

const db = require('../db');
const scheduler = require('../scheduler');
const google = require('../google');

// Spy on scheduler and db
const scheduleMessageSpy = jest.spyOn(scheduler, 'scheduleMessage');
const loadPendingMessagesSpy = jest.spyOn(scheduler, 'loadPendingMessages');

// Now require index.js to initialize it
const { client } = require('../index');

describe('bot index.js integration', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        scheduleMessageSpy.mockClear();
        loadPendingMessagesSpy.mockClear();
        mockClientInstance.sendMessage.mockClear();
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        db.initDatabase(TEST_DB_PATH);
    });

    afterEach(() => {
        // Clear active jobs to prevent Jest from hanging
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

    test('should register event listeners and initialize client', () => {
        expect(client.on).toHaveBeenCalledWith('qr', expect.any(Function));
        expect(client.on).toHaveBeenCalledWith('ready', expect.any(Function));
        expect(client.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(client.on).toHaveBeenCalledWith('message_create', expect.any(Function));
        expect(client.initialize).toHaveBeenCalled();
    });

    test('should load pending messages on ready event', () => {
        // Trigger ready callback
        mockEvents['ready']();
        expect(loadPendingMessagesSpy).toHaveBeenCalledWith(TEST_DB_PATH);
    });

    test('should process a valid /schedule command', async () => {
        const incomingMessage = {
            body: '/schedule 5491112345678 05-23-2030 15:30 Hello from tests!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        // Trigger message callback
        await mockEvents['message'](incomingMessage);

        // Verify it replies with success message
        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        // Verify db has the message
        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe('5491112345678@c.us');
        expect(messages[0].body).toBe('Hello from tests!');
        const expectedDate = new Date(2030, 4, 23, 15, 30, 0, 0);
        expect(new Date(messages[0].scheduledAt).getTime()).toBe(expectedDate.getTime());

        // Verify scheduler was called
        expect(scheduleMessageSpy).toHaveBeenCalledWith(messages[0], TEST_DB_PATH);
    });

    test('should process /schedule command with single digit hour and month', async () => {
        const incomingMessage = {
            body: '/schedule 5491112345678 5-3-2030 9:05 Hello single digits!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        const added = messages.find(m => m.body === 'Hello single digits!');
        expect(added).toBeDefined();
        expect(added.to).toBe('5491112345678@c.us');
        const expectedDate = new Date(2030, 4, 3, 9, 5, 0, 0);
        expect(new Date(added.scheduledAt).getTime()).toBe(expectedDate.getTime());
    });

    test('should respond with usage instructions if /schedule arguments are invalid', async () => {
        const incomingMessage = {
            body: '/schedule 5491112345678 05-23-2030', // missing time and body
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Uso: /schedule')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(0);
        expect(scheduleMessageSpy).not.toHaveBeenCalled();
    });

    test('should respond with error if date parsing throws error', async () => {
        const incomingMessage = {
            body: '/schedule 5491112345678 01-01-2020 12:00 Hello in past!', // past date
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Error: Date must be in the future')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(0);
        expect(scheduleMessageSpy).not.toHaveBeenCalled();
    });

    test('should process scheduling to quoted group name by resolving JID dynamically', async () => {
        mockClientInstance.getChats.mockResolvedValue([
            {
                isGroup: true,
                name: 'Eventos vapor',
                id: { _serialized: '120363024843194098@g.us' }
            },
            {
                isGroup: false,
                name: 'Some User',
                id: { _serialized: '12345@c.us' }
            }
        ]);

        const incomingMessage = {
            body: '/schedule "Eventos vapor" 05-23-2030 15:30 Quoted group message!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe('120363024843194098@g.us');
        expect(messages[0].body).toBe('Quoted group message!');
    });

    test('should respond with error if group name cannot be resolved', async () => {
        mockClientInstance.getChats.mockResolvedValue([
            {
                isGroup: true,
                name: 'Other Group',
                id: { _serialized: '99999@g.us' }
            }
        ]);

        const incomingMessage = {
            body: '/schedule "Eventos vapor" 05-23-2030 15:30 This should fail!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Error: No se encontró ningún chat o grupo llamado "Eventos vapor"')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(0);
    });

    test('should process scheduling to contact name (non-group chat) successfully', async () => {
        mockClientInstance.getChats.mockResolvedValue([
            {
                isGroup: false,
                name: 'Xiomara',
                id: { _serialized: '5491198765432@c.us' }
            }
        ]);

        const incomingMessage = {
            body: '/schedule "Xiomara" 05-23-2030 15:30 Hola Xiomara!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe('5491198765432@c.us');
        expect(messages[0].body).toBe('Hola Xiomara!');
    });

    test('should process scheduling with "en <minutos>" relative format', async () => {
        mockClientInstance.getChats.mockResolvedValue([
            {
                isGroup: false,
                name: 'Xiomara',
                id: { _serialized: '5491198765432@c.us' }
            }
        ]);

        const incomingMessage = {
            body: '/schedule "Xiomara" en 5 Hola in 5 minutes!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        const now = Date.now();
        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe('5491198765432@c.us');
        expect(messages[0].body).toBe('Hola in 5 minutes!');
        
        // Scheduled time should be roughly now + 5 minutes
        const scheduledTime = new Date(messages[0].scheduledAt).getTime();
        expect(scheduledTime).toBeGreaterThanOrEqual(now + 5 * 60 * 1000 - 2000);
        expect(scheduledTime).toBeLessThanOrEqual(now + 5 * 60 * 1000 + 2000);
    });

    test('should process scheduling with "hoy en <minutos>" relative format', async () => {
        mockClientInstance.getChats.mockResolvedValue([
            {
                isGroup: false,
                name: 'Xiomara',
                id: { _serialized: '5491198765432@c.us' }
            }
        ]);

        const incomingMessage = {
            body: '/schedule "Xiomara" hoy en 10 Hola today in 10 minutes!',
            from: 'my-number@c.us',
            reply: jest.fn().mockResolvedValue()
        };

        const now = Date.now();
        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('Message scheduled successfully!')
        );

        const messages = db.getMessages(TEST_DB_PATH);
        const added = messages.find(m => m.body === 'Hola today in 10 minutes!');
        expect(added).toBeDefined();
        expect(added.to).toBe('5491198765432@c.us');
        
        const scheduledTime = new Date(added.scheduledAt).getTime();
        expect(scheduledTime).toBeGreaterThanOrEqual(now + 10 * 60 * 1000 - 2000);
        expect(scheduledTime).toBeLessThanOrEqual(now + 10 * 60 * 1000 + 2000);
    });

    test('should respond with the group ID when /groupid command is sent', async () => {
        const incomingMessage = {
            body: '/groupid',
            from: '120363024843194098@g.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('120363024843194098@g.us')
        );
    });

    test('should respond with the group ID when /groupid command is self-created (fromMe is true)', async () => {
        const incomingMessage = {
            body: '/groupid',
            fromMe: true,
            from: '9247349829794@lid',
            to: '120363334849146364@g.us',
            reply: jest.fn().mockResolvedValue()
        };

        await mockEvents['message_create'](incomingMessage);

        expect(incomingMessage.reply).toHaveBeenCalledWith(
            expect.stringContaining('120363334849146364@g.us')
        );
    });

    describe('auto-react feature', () => {
        test('should process a valid /autoreact command to enable reactions', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                {
                    isGroup: true,
                    name: 'Eventos vapor',
                    id: { _serialized: '120363334849146364@g.us' }
                }
            ]);

            const incomingMessage = {
                body: '/autoreact "Eventos vapor" 😂',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Auto-reacción activada con el emoji 😂 para el chat/grupo "Eventos vapor"')
            );

            // Verify db has the autoReaction
            const reactions = db.getAutoReactions(TEST_DB_PATH);
            expect(reactions['120363334849146364@g.us']).toBe('😂');
        });

        test('should process a valid /autoreact command to disable reactions', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                {
                    isGroup: true,
                    name: 'Eventos vapor',
                    id: { _serialized: '120363334849146364@g.us' }
                }
            ]);

            // Save one first
            db.saveAutoReaction('120363334849146364@g.us', '😂', TEST_DB_PATH);

            const incomingMessage = {
                body: '/autoreact "Eventos vapor" off',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Auto-reacción desactivada para el chat/grupo "Eventos vapor"')
            );

            const reactions = db.getAutoReactions(TEST_DB_PATH);
            expect(reactions['120363334849146364@g.us']).toBeUndefined();
        });

        test('should react to non-command messages in a configured chat', async () => {
            // Configure auto-reaction
            db.saveAutoReaction('120363334849146364@g.us', '😂', TEST_DB_PATH);

            const incomingMessage = {
                body: 'Hola grupo',
                from: '120363334849146364@g.us',
                react: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.react).toHaveBeenCalledWith('😂');
        });

        test('should process a valid /autoreact command to enable user-specific reactions', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                {
                    isGroup: true,
                    name: 'Eventos vapor',
                    id: { _serialized: '120363334849146364@g.us' }
                }
            ]);

            const incomingMessage = {
                body: '/autoreact "Eventos vapor" "Frank" 🔥',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Auto-reacción activada con el emoji 🔥 para el usuario "Frank" en el chat/grupo "Eventos vapor"')
            );

            // Verify db has the autoReaction
            const reactions = db.getAutoReactions(TEST_DB_PATH);
            expect(reactions['120363334849146364@g.us']).toEqual({
                default: null,
                users: { frank: '🔥' }
            });
        });

        test('should react with user-specific emoji and fallback to default', async () => {
            db.saveAutoReaction('120363334849146364@g.us', '😂', TEST_DB_PATH);
            db.saveAutoReaction('120363334849146364@g.us', '🔥', 'Frank', TEST_DB_PATH);

            // Message from Frank
            const frankMsg = {
                body: 'Hola',
                from: '120363334849146364@g.us',
                react: jest.fn().mockResolvedValue(),
                getContact: jest.fn().mockResolvedValue({
                    id: { _serialized: '5491112345678@c.us' },
                    number: '5491112345678',
                    name: 'Frank',
                    pushname: 'Frankie'
                })
            };

            await mockEvents['message'](frankMsg);
            expect(frankMsg.react).toHaveBeenCalledWith('🔥');

            // Message from Alice (fallback to default)
            const aliceMsg = {
                body: 'Hola',
                from: '120363334849146364@g.us',
                react: jest.fn().mockResolvedValue(),
                getContact: jest.fn().mockResolvedValue({
                    id: { _serialized: '5491187654321@c.us' },
                    number: '5491187654321',
                    name: 'Alice',
                    pushname: 'Alice'
                })
            };

            await mockEvents['message'](aliceMsg);
            expect(aliceMsg.react).toHaveBeenCalledWith('😂');
        });

        test('should NOT react to command messages in a configured chat', async () => {
            db.saveAutoReaction('120363334849146364@g.us', '😂', TEST_DB_PATH);

            const incomingMessage = {
                body: '/schedule something',
                from: '120363334849146364@g.us',
                react: jest.fn().mockResolvedValue(),
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.react).not.toHaveBeenCalled();
        });
    });

    describe('new command features', () => {
        test('should respond with help instructions when /help command is sent', async () => {
            const incomingMessage = {
                body: '/help',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Guía de Comandos del Bot de WhatsApp')
            );
        });

        test('should list active auto-reactions when /autoreact list is sent', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                { id: { _serialized: '12345@g.us' }, name: 'Eventos vapor' }
            ]);

            // Save some auto-reactions
            db.saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);

            const incomingMessage = {
                body: '/autoreact list',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('1. *Chat:* Eventos vapor | *Emoji:* 😂')
            );
        });

        test('should list user-specific auto-reactions when /autoreact list is sent', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                { id: { _serialized: '12345@g.us' }, name: 'Eventos vapor' }
            ]);

            db.saveAutoReaction('12345@g.us', '😂', TEST_DB_PATH);
            db.saveAutoReaction('12345@g.us', '🔥', 'Frank', TEST_DB_PATH);

            const incomingMessage = {
                body: '/autoreact list',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('1. *Chat:* Eventos vapor')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('• *Por defecto:* 😂')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('• *Frank:* 🔥')
            );
        });

        test('should reply when /autoreact list is empty', async () => {
            const incomingMessage = {
                body: '/autoreact list',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('No hay auto-reacciones activas.')
            );
        });

        test('should list active scheduled messages when /schedule list is sent', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                { id: { _serialized: '5491112345678@c.us' }, name: 'Xiomara' }
            ]);

            db.addMessage({
                to: '5491112345678@c.us',
                body: 'Hello Xiomara',
                scheduledAt: new Date(Date.now() + 50000).toISOString(),
                status: 'pending'
            }, TEST_DB_PATH);

            db.addMessage({
                to: '5491112345678@c.us',
                body: 'Everyday hello',
                status: 'recurring',
                recurrence: { type: 'daily', time: '12:00', dayOfWeek: null }
            }, TEST_DB_PATH);

            const incomingMessage = {
                body: '/schedule list',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Hello Xiomara')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Everyday hello')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Diario (Todos los días a las 12:00)')
            );
        });

        test('should reply when /schedule list is empty', async () => {
            const incomingMessage = {
                body: '/schedule list',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('No hay mensajes programados activos o pendientes.')
            );
        });

        test('should cancel a scheduled message using /schedule cancel <ID>', async () => {
            const msg = db.addMessage({
                to: '5491112345678@c.us',
                body: 'Cancel this message',
                scheduledAt: new Date(Date.now() + 100000).toISOString(),
                status: 'pending'
            }, TEST_DB_PATH);

            // Mock job
            const mockJob = { cancel: jest.fn() };
            scheduler.activeJobs.set(msg.id, mockJob);

            const incomingMessage = {
                body: `/schedule cancel ${msg.id}`,
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining(`Mensaje programado con ID *${msg.id}* cancelado correctamente.`)
            );

            // Verify db status updated to cancelled
            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages[0].status).toBe('cancelled');

            // Verify active job cancelled and deleted
            expect(mockJob.cancel).toHaveBeenCalled();
            expect(scheduler.activeJobs.has(msg.id)).toBe(false);
        });

        test('should parse and schedule daily recurring messages', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                { id: { _serialized: '12345@g.us' }, name: 'Eventos vapor' }
            ]);

            const incomingMessage = {
                body: '/schedule "Eventos vapor" cada dia 18:30 Reporte diario',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Mensaje periódico diario programado con éxito!')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(1);
            expect(messages[0].status).toBe('recurring');
            expect(messages[0].recurrence).toEqual({
                type: 'daily',
                dayOfWeek: null,
                time: '18:30'
            });
            expect(messages[0].body).toBe('Reporte diario');
        });

        test('should parse and schedule weekly recurring messages', async () => {
            mockClientInstance.getChats.mockResolvedValue([
                { id: { _serialized: '12345@g.us' }, name: 'Eventos vapor' }
            ]);

            const incomingMessage = {
                body: '/schedule "Eventos vapor" cada lunes 09:00 Reunión de inicio',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Mensaje periódico semanal programado con éxito!')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(1);
            expect(messages[0].status).toBe('recurring');
            expect(messages[0].recurrence).toEqual({
                type: 'weekly',
                dayOfWeek: 1, // lunes
                time: '09:00'
            });
            expect(messages[0].body).toBe('Reunión de inicio');
        });
    });

    describe('Google Calendar commands', () => {
        test('/calendar hoy should display list of events', async () => {
            google.getTodayEvents.mockResolvedValueOnce([
                { id: '1', summary: 'Daily Scrum', start: { dateTime: '2026-05-25T10:00:00.000Z' } },
                { id: '2', summary: 'Lunch Meeting', start: { dateTime: '2026-05-25T13:30:00.000Z' } }
            ]);

            const incomingMessage = {
                body: '/calendar hoy',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(google.getTodayEvents).toHaveBeenCalled();
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Eventos de Hoy en Google Calendar:')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Daily Scrum')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Lunch Meeting')
            );
        });

        test('/calendar hoy should respond when no events are scheduled', async () => {
            google.getTodayEvents.mockResolvedValueOnce([]);

            const incomingMessage = {
                body: '/calendar hoy',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('No hay eventos agendados para hoy.')
            );
        });

        test('/calendar hoy should handle errors gracefully', async () => {
            google.getTodayEvents.mockRejectedValueOnce(new Error('API failure'));

            const incomingMessage = {
                body: '/calendar hoy',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error al consultar calendario: API failure')
            );
        });

        test('/calendar sync should trigger synchronization and display results', async () => {
            google.syncCalendarMessages.mockResolvedValueOnce({
                added: 2,
                updated: 1,
                skipped: 3,
                errors: 0
            });

            const incomingMessage = {
                body: '/calendar sync',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Sincronizando eventos del calendario...')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Sincronización completada!')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('*Agregados:* 2')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('*Actualizados:* 1')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('*Omitidos:* 3')
            );
        });

        test('/calendar sync should handle errors gracefully', async () => {
            google.syncCalendarMessages.mockRejectedValueOnce(new Error('Sync failed'));

            const incomingMessage = {
                body: '/calendar sync',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error al sincronizar calendario: Sync failed')
            );
        });

        test('/calendar add should create event successfully', async () => {
            google.createEvent.mockResolvedValueOnce({
                summary: 'Dentista'
            });

            const incomingMessage = {
                body: '/calendar add "Dentista" mañana 16:30',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(google.createEvent).toHaveBeenCalledWith(
                'Dentista',
                expect.any(Date),
                expect.any(Date)
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Evento creado en Google Calendar!')
            );
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('*Título:* Dentista')
            );
        });

        test('/calendar add should handle usage error', async () => {
            const incomingMessage = {
                body: '/calendar add "Dentista"', // missing time/date
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Uso: /calendar add')
            );
        });

        test('/calendar add should handle API errors gracefully', async () => {
            google.createEvent.mockRejectedValueOnce(new Error('Insert error'));

            const incomingMessage = {
                body: '/calendar add "Dentista" mañana 15:00',
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Error al crear evento: Insert error')
            );
        });
    });

    describe('media scheduling and saving commands', () => {
        const mediaDir = path.join(__dirname, '../media');

        beforeEach(() => {
            if (!fs.existsSync(mediaDir)) {
                fs.mkdirSync(mediaDir, { recursive: true });
            }
        });

        afterEach(() => {
            if (fs.existsSync(mediaDir)) {
                const files = fs.readdirSync(mediaDir);
                for (const file of files) {
                    if (file.startsWith('test_') || file.startsWith('media_')) {
                        fs.unlinkSync(path.join(mediaDir, file));
                    }
                }
            }
        });

        test('should process a valid /schedulemedia command with local file', async () => {
            const testFileName = 'test_menu.pdf';
            fs.writeFileSync(path.join(mediaDir, testFileName), 'dummy content');

            const incomingMessage = {
                body: `/schedulemedia 5491112345678 05-23-2030 15:30 "${testFileName}" Aquí está el menú`,
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Archivo multimedia programado con éxito!')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(1);
            expect(messages[0].to).toBe('5491112345678@c.us');
            expect(messages[0].body).toBe('Aquí está el menú');
            expect(messages[0].mediaPath).toBe(testFileName);
            expect(messages[0].mediaUrl).toBeNull();
        });

        test('should process a valid /schedulemedia command with url', async () => {
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
                ok: true,
                status: 200,
                headers: new Map([['content-type', 'image/png']]),
                arrayBuffer: async () => new ArrayBuffer(8)
            });

            const incomingMessage = {
                body: `/schedulemedia 5491112345678 05-23-2030 15:30 "https://example.com/test_image.png" Foto de prueba`,
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Archivo multimedia programado con éxito!')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(1);
            expect(messages[0].to).toBe('5491112345678@c.us');
            expect(messages[0].body).toBe('Foto de prueba');
            expect(messages[0].mediaUrl).toBe('https://example.com/test_image.png');
            expect(messages[0].mediaPath).toBeNull();

            fetchSpy.mockRestore();
        });

        test('should fail /schedulemedia if local file does not exist', async () => {
            const incomingMessage = {
                body: `/schedulemedia 5491112345678 05-23-2030 15:30 "nonexistent_file.pdf" Menú`,
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('El archivo local "nonexistent_file.pdf" no existe')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(0);
        });

        test('should fail /schedulemedia if URL is not accessible', async () => {
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
                ok: false,
                status: 404
            });

            const incomingMessage = {
                body: `/schedulemedia 5491112345678 05-23-2030 15:30 "https://example.com/nonexistent.png" Foto`,
                from: 'my-number@c.us',
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('La URL no es accesible')
            );

            const messages = db.getMessages(TEST_DB_PATH);
            expect(messages).toHaveLength(0);

            fetchSpy.mockRestore();
        });

        test('should process a valid /save command with media', async () => {
            const mockMedia = {
                mimetype: 'application/pdf',
                data: Buffer.from('test pdf content').toString('base64'),
                filename: 'test_save_menu.pdf'
            };

            const incomingMessage = {
                body: '/save',
                from: 'my-number@c.us',
                hasMedia: true,
                downloadMedia: jest.fn().mockResolvedValue(mockMedia),
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.downloadMedia).toHaveBeenCalled();
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Archivo guardado como test_save_menu.pdf en el servidor')
            );

            const savedPath = path.join(mediaDir, 'test_save_menu.pdf');
            expect(fs.existsSync(savedPath)).toBe(true);
            expect(fs.readFileSync(savedPath, 'utf8')).toBe('test pdf content');
        });

        test('should process a valid /save command specifying a custom name', async () => {
            const mockMedia = {
                mimetype: 'image/png',
                data: Buffer.from('test png content').toString('base64'),
                filename: null
            };

            const incomingMessage = {
                body: '/save "test_custom_name.png"',
                from: 'my-number@c.us',
                hasMedia: true,
                downloadMedia: jest.fn().mockResolvedValue(mockMedia),
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.downloadMedia).toHaveBeenCalled();
            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Archivo guardado como test_custom_name.png en el servidor')
            );

            const savedPath = path.join(mediaDir, 'test_custom_name.png');
            expect(fs.existsSync(savedPath)).toBe(true);
            expect(fs.readFileSync(savedPath, 'utf8')).toBe('test png content');
        });

        test('should reply with error if /save is sent without media', async () => {
            const incomingMessage = {
                body: '/save',
                from: 'my-number@c.us',
                hasMedia: false,
                reply: jest.fn().mockResolvedValue()
            };

            await mockEvents['message'](incomingMessage);

            expect(incomingMessage.reply).toHaveBeenCalledWith(
                expect.stringContaining('Este comando debe enviarse como pie de foto/comentario de un archivo multimedia.')
            );
        });
    });
});

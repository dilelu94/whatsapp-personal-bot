// Ordered command registry. Order matters: more specific prefixes must come
// before broader ones (e.g. /autoreact list before /autoreact, /schedulemedia
// before /schedule). The final entry is the non-command fallback for auto-reactions.
const commands = [
    require('./save'),
    require('./groupid'),
    require('./help'),
    require('./calendarToday'),
    require('./calendarSync'),
    require('./calendarAdd'),
    require('./autoreactList'),    // before autoreact
    require('./scheduleList'),     // before schedule
    require('./scheduleCancel'),   // before schedule
    require('./autoreact'),
    require('./scheduleMedia'),    // before schedule
    require('./schedule'),
    require('./autoReactListener'),
];

async function dispatch(ctx) {
    for (const cmd of commands) {
        if (cmd.match(ctx.msg)) {
            await cmd.handle(ctx);
            return;
        }
    }
}

module.exports = { dispatch, commands };

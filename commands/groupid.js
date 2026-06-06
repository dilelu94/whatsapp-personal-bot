module.exports = {
    match: (msg) => msg.body === '/groupid',
    handle: async ({ msg }) => {
        const chatJid = msg.fromMe ? msg.to : msg.from;
        await msg.reply(`ID de este chat/grupo: *${chatJid}*`);
    },
};

const HELP_MSG = `🤖 *Guía de Comandos del Bot de WhatsApp*

📅 *Programación de Mensajes:*
• \`/schedule "<contacto|grupo>" en <minutos> <mensaje>\`
  _Ejemplo: \`/schedule "Juan" en 5 hola\` (envía en 5 minutos)_
• \`/schedule "<contacto|grupo>" hoy en <minutos> <mensaje>\`
  _Ejemplo: \`/schedule "Eventos vapor" hoy en 15 reunión\` (envía en 15 minutos)_
• \`/schedule "<contacto|grupo>" <fecha|hoy|mañana|día> <HH:mm> <mensaje>\`
  _Formato de fecha: MM-DD-YYYY o MM-DD (asume año actual)_
  _Ejemplos:_
  - \`/schedule "Juan" hoy 20:55 hola\`
  - \`/schedule "Eventos vapor" mañana 10:00 buenos días\`
  - \`/schedule "Eventos vapor" lunes 15:30 reunión\` (próximo lunes)
  - \`/schedule "Juan" 05-30 18:00 feliz cumpleaños\` (este año)
  - \`/schedule "Juan" 05-30-2027 18:00 feliz cumpleaños\` (año específico)
• \`/schedulemedia "<contacto|grupo>" <fecha|hoy|mañana|día> <HH:mm> "<nombre_archivo_o_url>" <mensaje>\`
  _Ejemplos:_
  - \`/schedulemedia "Juan" hoy 20:55 "menu.pdf" Aquí está el menú\`
  - \`/schedulemedia "Eventos vapor" mañana 12:00 "https://example.com/pic.jpg" Foto de mañana\`

🔄 *Mensajes Periódicos:*
• \`/schedule "<contacto|grupo>" cada dia <HH:mm> <mensaje>\`
  _Ejemplo: \`/schedule "Juan" cada dia 09:00 ¡Buen día!\` (todos los días a las 9 am)_
• \`/schedule "<contacto|grupo>" cada <día_semana> <HH:mm> <mensaje>\`
  _Ejemplo: \`/schedule "Eventos vapor" cada lunes 18:00 Reporte semanal\` (todos los lunes a las 6 pm)_

📋 *Administración de Programaciones y Archivos:*
• \`/schedule list\` - Muestra todos los mensajes programados activos (únicos y periódicos).
• \`/schedule cancel <ID>\` - Cancela un mensaje programado usando su ID.
• \`/save [nombre.ext]\` - Guarda un archivo multimedia recibido en el servidor (usar como pie de foto/comentario del archivo).

React *Auto-Reacciones:*
• \`/autoreact "<contacto|grupo>" <emoji>\` - Activa reacciones automáticas por defecto para todo el chat.
  _Ejemplo: \`/autoreact "Eventos vapor" 😂\`_
• \`/autoreact "<contacto|grupo>" "<usuario>" <emoji>\` - Activa reacciones automáticas específicas para un usuario.
  _Ejemplo: \`/autoreact "Eventos vapor" "Frank" 🔥\`_
• \`/autoreact "<contacto|grupo>" [usuario] off\` - Desactiva las reacciones para todo el chat o para un usuario específico.
• \`/autoreact list\` - Muestra la lista de chats con auto-reacción activa.

🔍 *Utilidades:*
• \`/groupid\` - Muestra el ID único (JID) del chat o grupo donde se envía el comando.
• \`/help\` - Muestra esta guía de comandos.

📅 *Google Calendar:*
• \`/calendar hoy\` - Muestra todos los eventos de tu Google Calendar para el día de hoy.
• \`/calendar sync\` - Sincroniza mensajes programados desde el calendario.
• \`/calendar add "<título>" <fecha|hoy|mañana|día> <HH:mm>\` - Crea un evento de 1 hora.
  _Ejemplo: \`/calendar add "Dentista" mañana 16:30\`_`;

module.exports = {
    match: (msg) => msg.body && msg.body.trim() === '/help',
    handle: async ({ msg }) => {
        await msg.reply(HELP_MSG);
    },
};

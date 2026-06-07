# WhatsApp Personal Bot — Documentación Interna

## Arquitectura General

```
index.js (entry point)
  ├── config.js        → variables de entorno (.env)
  ├── db.js            → persistencia JSON (storage.json)
  ├── scheduler.js     → cola de mensajes programados (node-schedule)
  ├── google.js        → integración Google Calendar API
  ├── utils.js         → parseo de fechas, JIDs, utilidades
  ├── utils/telegram.js → alertas por Telegram
  └── commands/        → módulos de comandos
        ├── index.js        → router (match → handle)
        ├── schedule.js     → /schedule
        ├── scheduleMedia.js → /schedulemedia
        ├── scheduleList.js  → /schedule list
        ├── scheduleCancel.js → /schedule cancel
        ├── save.js         → /save (multimedia)
        ├── autoreact.js    → /autoreact
        ├── autoreactList.js → /autoreact list
        ├── autoReactListener.js → reacciones automáticas
        ├── help.js         → /help
        ├── groupid.js      → /groupid
        ├── calendarAdd.js  → /calendar add
        ├── calendarSync.js → /calendar sync
        └── calendarToday.js → /calendar today
```

## Conexión con WhatsApp

El bot usa `whatsapp-web.js` que controla una instancia headless de Chromium (Puppeteer) que carga WhatsApp Web. Soporta dos métodos de vinculación:

- **QR code**: escanear desde el celular
- **Código de 8 dígitos**: si se define `WHATSAPP_PAIRING_NUMBER` en `.env`, envía el código por Telegram y se vincula automáticamente

La sesión autenticada se guarda en `.wwebjs_auth/` para reutilizarse en reinicios.

## Heartbeat humanizado (`index.js`)

### Problema original

El heartbeat usaba `setInterval` fijo de 10 minutos exactos y llamaba `sendPresenceAvailable()` siempre. Esto es un patrón 100% bot: mismo intervalo, misma acción, mismos logs. WhatsApp lo detecta como automatización y banea.

### Solución implementada

| Aspecto      | Antes                                           | Ahora                                             |
| ------------ | ----------------------------------------------- | ------------------------------------------------- |
| Intervalo    | `10 * 60 * 1000` (fijo)                         | `randomRange(8 min, 15 min)`                      |
| Presencia    | `sendPresenceAvailable()` siempre               | 65% available, 20% solo verificar, 15% idle       |
| Temporizador | `setInterval`                                   | `setTimeout` recursivo (cada ciclo se reprograma) |
| Logs         | `"[Bot] Ejecutando heartbeat..."` siempre igual | 5 mensajes distintos aleatorios                   |

La clave es que cada ciclo es impredecible:

1. Se calcula un delay aleatorio entre 8-15 minutos
2. Se ejecuta `heartbeatCycle()` que decide al azar si marcar presencia o no
3. Se vuelve a programar con otro delay aleatorio

Esto evita el patrón de intervalos fijos que WhatsApp monitorea.

## Mensajes programados (`scheduler.js`)

### Jitter en la ejecución

Cuando `node-schedule` dispara un mensaje, se agrega un retardo aleatorio de 0-30 segundos antes de enviarlo. Sin esto, los mensajes se enviarían siempre en el segundo exacto `:00`, lo cual es antinatural.

### Simulación de escritura

Antes de enviar cualquier mensaje programado:

1. Espera 1.5-5 segundos aleatorios (tiempo de "leer" el chat)
2. Marca presencia disponible (simula "abrir WhatsApp")
3. Recién ahí envía el mensaje

## Auto-reacciones (`commands/autoReactListener.js`)

### Comportamiento humano

- **Delay**: espera 1-4 segundos antes de reaccionar (nadie reacciona instantáneamente)
- **Skip**: 5% de probabilidad de no reaccionar (un humano a veces se distrae o decide no reaccionar)

## Comandos (`commands/index.js`)

El router `dispatch()` recorre los comandos en orden de prioridad. Cada módulo exporta `{ match(msg), handle(ctx) }`:

- `match()` determina si el mensaje activa el comando
- `handle(ctx)` ejecuta la lógica con acceso a `{ msg, client, dbPath, mediaDir }`

El orden importa: los prefijos más específicos (`/autoreact list`, `/schedule list`) deben ir antes que los genéricos (`/autoreact`, `/schedule`). El último módulo `autoReactListener` captura cualquier mensaje que no sea comando para las reacciones automáticas.

## Base de datos (`db.js`)

Persistencia en `storage.json` con estructura:

```json
{
  "messages": [{ "id", "to", "body", "scheduledAt", "status", ... }],
  "autoReactions": { "jid@c.us": "😂", ... }
}
```

Es un archivo JSON plano — no requiere base de datos externa. Ideal para despliegues simples en VPS.

## Alertas por Telegram (`utils/telegram.js`)

Envía notificaciones al usuario mediante la API de Telegram:

- Código QR y código de vinculación
- Alertas de conexión/desconexión
- Reportes de mensajes enviados/vencidos al iniciar

Las fotos QR se envían con `multipart/form-data` directo (sin librerías externas). Usa debounce para no spamear: edita el mismo mensaje en lugar de crear uno nuevo.

## Google Calendar (`google.js`)

Sincroniza eventos del calendario que siguen el formato `[WA] "contacto" - mensaje`. Escanea los próximos 7 días cada 10 minutos y programa los mensajes correspondientes.

Workaround: usa `promiseWithTimeout()` para las llamadas a `client.getChats()` que pueden congelarse si la sesión no está estabilizada.

## Configuración (`config.js`)

Carga variables de entorno con fallback a `pm2-telegram-monitor/config.json` (para mantener compatibilidad con el monitor de PM2). Las rutas de datos se pueden personalizar con variables de entorno para entornos Docker.

## Despliegue

- **Docker**: `docker compose up -d` usa Puppeteer con Chromium integrado
- **PM2**: `pm2 start index.js --name "whatsapp-bot"` con monitor externo
- En Docker, los datos persistentes van en `/usr/src/app/data/` montado como volumen

## Workarounds y por qué

### ¿Por qué имитировать humanos?

WhatsApp Web detecta acceso programático mediante:

1. Intervalos fijos entre acciones
2. Presencia siempre "en línea" sin variación
3. Reacciones instantáneas a mensajes
4. Mensajes enviados en el segundo exacto

Si el bot se comporta como un script, WhatsApp bloquea la cuenta por violar términos de servicio.

### Limpieza de archivos lock de Chromium

```js
['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(...)
```

Chromium a veces no limpia estos archivos si el proceso se mata abruptamente. Si no se eliminan, el próximo inicio falla porque otro proceso parece tener la sesión abierta.

### Timeouts generosos

- `authTimeoutMs: 300000` — 5 minutos para escanear QR/ingresar código
- `protocolTimeout: 300000` — 5 minutos para respuestas del protocolo
- Puppeteer `args` extensos para maximizar compatibilidad en entornos headless

### Manejo de desconexión

Cuando WhatsApp desconecta el bot, espera 5 segundos y hace `process.exit(1)`. PM2 detecta la salida y reinicia automáticamente. Esto permite reconectar sin intervención manual.

### Sesión multi-dispositivo

whatsapp-web.js usa el protocolo multi-dispositivo de WhatsApp. La sesión se autentica una vez y se reutiliza mediante `LocalAuth` que persiste las credenciales localmente. No requiere escanear QR en cada reinicio.

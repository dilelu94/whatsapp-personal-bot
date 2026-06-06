# WhatsApp Personal Bot

> **Nota de motivación:** Este bot fue desarrollado principalmente para resolver una necesidad común: poder **programar mensajes de WhatsApp** para que se envíen en un momento específico en el futuro. Dado que WhatsApp es una aplicación de mensajería instantánea líder pero carece de esta función de manera nativa, este proyecto surge como una solución automatizada y robusta para gestionar tus envíos personales.

Un bot personal de WhatsApp construido con [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) y Node.js. Permite programar mensajes de texto y multimedia (únicos y recurrentes), configurar auto-reacciones, sincronizarse con Google Calendar, guardar archivos multimedia en el servidor, y mantener la sesión activa de forma autónoma con un sistema de heartbeat y alertas a Telegram.

## Características

*   **📅 Programación de Mensajes**: Programa mensajes para enviarse en una fecha y hora determinada, o de forma relativa (ej. "en 5 minutos").
*   **🔄 Mensajes Periódicos**: Programa mensajes que se repiten diariamente o en días específicos de la semana a una hora fija.
*   **📎 Programación de Multimedia**: Programa el envío de archivos locales o URLs de imágenes/documentos en una fecha y hora específica con un mensaje opcional.
*   **📋 Gestión de Programaciones**: Lista los mensajes activos y cancélalos usando su ID único.
*   **💾 Guardado de Archivos**: Guarda archivos multimedia recibidos directamente en el servidor con nombre personalizable.
*   **😂 Auto-Reacciones**:
    *   Configura reacciones con emojis automáticas por defecto para todo un chat.
    *   Configura auto-reacciones personalizadas basadas en el usuario/remitente del mensaje.
*   **📅 Integración con Google Calendar**:
    *   Visualiza tu agenda del día directamente en WhatsApp.
    *   Crea eventos de 1 hora en tu calendario desde WhatsApp.
    *   **Sincronización Automática**: El bot escanea tu calendario en busca de eventos que inicien con el formato `[WA] "contacto" - mensaje` (o JID directo) y programa automáticamente el envío del mensaje en la hora de inicio del evento.
*   **🔔 Alertas a Telegram**: Recibe notificaciones en Telegram cuando el bot requiere vinculación (código de 8 dígitos o QR), cuando se desconecta, y cuando detecta problemas de conexión.
*   **💓 Heartbeat / Keep-Alive**: El bot verifica automáticamente cada 10 minutos que la conexión sigue activa. Si detecta una desconexión silenciosa o un navegador congelado, alerta por Telegram y se reinicia automáticamente vía PM2.
*   **🔄 Envío Retroactivo**: Al reiniciar, el bot envía automáticamente mensajes programados que se perdieron en las últimas 24 horas y genera un reporte consolidado por Telegram.
*   **🔗 Vinculación por Código**: Opción de vincular el dispositivo mediante un código de 8 dígitos (en lugar de QR), ideal para vincular desde el mismo celular que usa Telegram.
*   **🔍 Utilidades**: Consulta el ID único (JID) de cualquier chat o grupo para programaciones directas.

---

## Requisitos Previos

*   **Node.js** (versión LTS recomendada, 18 o superior).
*   Una cuenta de WhatsApp activa para vincular la sesión (por código de 8 dígitos o escaneando el código QR).
*   *(Opcional)* Credenciales de una cuenta de servicio de Google Cloud para la integración con Google Calendar.
*   *(Opcional)* Un bot de Telegram y su chat ID para recibir alertas de estado (vinculación, desconexión, heartbeat).

---

## Instalación y Configuración

Puedes instalar y configurar el bot de forma tradicional en tu sistema o mediante **Docker** (recomendado para simplificar la gestión de dependencias de Puppeteer y Chromium).

### Opción A — Instalación Tradicional (Local/VPS)

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/dilelu94/whatsapp-personal-bot.git
    cd whatsapp-personal-bot
    ```

2.  **Instalar dependencias**:
    ```bash
    npm install
    ```

3.  **Ejecutar el Asistente de Configuración**:
    Ejecuta el siguiente comando para iniciar un asistente interactivo en terminal que creará tu archivo de configuración `.env` y probará tu conexión de Telegram:
    ```bash
    npm run setup
    ```

4.  **Configurar Google Calendar (Opcional)**:
    *   Crea un proyecto en [Google Cloud Console](https://console.cloud.google.com/).
    *   Habilita la **Google Calendar API**.
    *   Crea una **Cuenta de Servicio** (Service Account) y genera una clave privada en formato **JSON**.
    *   Guarda el archivo descargado como `googleCredentials.json` en la raíz del proyecto.
    *   *(Alternativa: Puedes copiar todo el contenido de ese JSON y pegarlo en la variable de entorno `GOOGLE_CREDENTIALS_JSON` de tu archivo `.env`).*
    *   Comparte tu calendario de Google con el correo de la cuenta de servicio (con permisos de lectura/escritura).

### Opción B — Instalación con Docker (Recomendado)

Docker instalará Chromium y todas las dependencias necesarias de forma automatizada e independiente del sistema operativo anfitrión.

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/dilelu94/whatsapp-personal-bot.git
    cd whatsapp-personal-bot
    ```
2.  **Generar el archivo `.env`**:
    Puedes ejecutar `npm run setup` localmente para generar tu `.env` de forma asistida, o crear manualmente un archivo `.env` guiándote con el archivo [.env.example](.env.example).
3.  **Iniciar el Bot**:
    ```bash
    docker compose up -d
    ```
    *(Toda la información de la base de datos, sesiones e imágenes descargadas se guardará en un solo volumen persistente en la carpeta `./data` en tu máquina local).*

---

## Uso del Bot

### Iniciar el Bot (Instalación Tradicional)

Para iniciar el bot, ejecuta:
```bash
npm start
```

Si configuraste la vinculación por código en el asistente (o en tu `.env`), recibirás un código de 8 dígitos en Telegram para vincular tu WhatsApp. De lo contrario, aparecerá un código QR en la terminal para escanear con tu aplicación de WhatsApp (`WhatsApp -> Dispositivos vinculados -> Vincular un dispositivo`).

Una vez vinculado, la sesión se guardará localmente en el directorio `.wwebjs_auth` (o en `./data` en Docker) para que no tengas que vincular de nuevo en futuros reinicios.

---

## Guía de Comandos

Envía cualquiera de estos comandos en un chat individual o grupal donde el bot tenga acceso:

### 📅 Programación de Mensajes

*   **Programar en base a minutos (en el mismo día):**
    *   `/schedule "<contacto|grupo>" en <minutos> <mensaje>`
    *   *Ejemplo:* `/schedule "Juan" en 5 hola` *(envía el mensaje en 5 minutos)*
*   **Programar con fecha/hora específica o relativa:**
    *   `/schedule "<contacto|grupo>" <fecha|hoy|mañana|día> <HH:mm> <mensaje>`
    *   *Ejemplos:*
        *   `/schedule "Juan" hoy 20:55 hola`
        *   `/schedule "Trabajo" mañana 10:00 buenos días`
        *   `/schedule "Grupo Fútbol" lunes 15:30 reunión` *(programa para el próximo lunes a las 15:30)*
        *   `/schedule "Mamá" 2026-05-30 18:00 feliz cumpleaños`

### 📎 Programación de Multimedia

*   **Programar el envío de un archivo local o URL:**
    *   `/schedulemedia "<contacto|grupo>" <fecha|hoy|mañana|día> <HH:mm> "<nombre_archivo_o_url>" <mensaje>`
    *   *Ejemplos:*
        *   `/schedulemedia "Juan" hoy 20:55 "menu.pdf" Aquí está el menú`
        *   `/schedulemedia "Trabajo" mañana 12:00 "https://example.com/pic.jpg" Foto de mañana`

### 🔄 Mensajes Periódicos (Recurrentes)

*   **Repetir todos los días a una hora específica:**
    *   `/schedule "<contacto|grupo>" cada dia <HH:mm> <mensaje>`
    *   *Ejemplo:* `/schedule "Socios" cada dia 09:00 ¡Buen día!`
*   **Repetir un día de la semana específico:**
    *   `/schedule "<contacto|grupo>" cada <lunes|martes|miércoles|...|domingo> <HH:mm> <mensaje>`
    *   *Ejemplo:* `/schedule "Equipo" cada lunes 18:00 Reporte semanal`

### 📋 Administración de Programaciones

*   **Listar mensajes programados activos o pendientes:**
    *   `/schedule list` *(muestra los IDs únicos de cada mensaje)*
*   **Cancelar un mensaje programado:**
    *   `/schedule cancel <ID>`
    *   *Ejemplo:* `/schedule cancel mpnnllsp3`

### 💾 Guardado de Archivos

*   **Guardar un archivo multimedia recibido en el servidor:**
    *   `/save [nombre_archivo.ext]` *(enviar como pie de foto/comentario del archivo multimedia)*
    *   *Ejemplo:* Envía una foto con el comentario `/save "foto_vacaciones.jpg"` para guardarla en el servidor con ese nombre.

### 😂 Auto-Reacciones

*   **Activar auto-reacción por defecto para todo un chat:**
    *   `/autoreact "<contacto|grupo>" <emoji>`
    *   *Ejemplo:* `/autoreact "Amigos" 😂`
*   **Activar auto-reacción específica para un usuario dentro de un chat:**
    *   `/autoreact "<contacto|grupo>" "<usuario>" <emoji>`
    *   *Ejemplo:* `/autoreact "Amigos" "Juan" 🔥`
*   **Desactivar reacciones para un chat o usuario específico:**
    *   `/autoreact "<contacto|grupo>" [usuario] off`
*   **Listar chats con auto-reacción activa:**
    *   `/autoreact list`

### 📅 Google Calendar

*   **Ver la agenda de hoy:**
    *   `/calendar hoy`
*   **Sincronizar programaciones manualmente desde el calendario:**
    *   `/calendar sync`
*   **Crear un evento rápido de 1 hora:**
    *   `/calendar add "<título>" <fecha|hoy|mañana|día> <HH:mm>`
    *   *Ejemplo:* `/calendar add "Dentista" mañana 16:30`

### 🔍 Utilidades

*   **Obtener JID único de un chat/grupo:**
    *   `/groupid` *(útil para programar mensajes usando el JID directo)*
*   **Guía de comandos rápida:**
    *   `/help`

---

## Desarrollo y Pruebas

Este proyecto utiliza **Jest** para las pruebas automatizadas.

Para ejecutar las pruebas:
```bash
npm test
```

Las pruebas incluyen cobertura para base de datos local, parseo de fechas, el programador (scheduler), y flujos de comandos simulados.

---

## Licencia

Este proyecto está bajo la licencia ISC.

---

## 🌐 Guía de Despliegue Gratis en Oracle Cloud (Siempre Gratis)

Puedes hostear este bot de forma continua y gratuita utilizando las instancias del nivel gratuito de **Oracle Cloud Infrastructure (OCI)**. A continuación se detalla cómo crear la instancia de Linux (VPS), conectarte y poner en marcha el bot.

### Paso 1: Crear la Instancia en Oracle Cloud
1. Regístrate en [Oracle Cloud](https://www.oracle.com/cloud/free/).
2. En el panel de control, ve a **Instancias de Computación** y haz clic en **Crear Instancia**.
3. Selecciona los siguientes parámetros:
   * **Imagen**: `Canonical Ubuntu 24.04` (o cualquier versión LTS reciente de Ubuntu).
   * **Forma (Shape)**: 
     * **VM.Standard.E2.1.Micro** (procesador AMD, 1 GB de RAM, elegible para *Always Free*).
     * Alternativamente, **VM.Standard.A1.Flex** (procesador ARM Ampere, hasta 4 OCPUs y 24 GB de RAM, elegible para *Always Free* según disponibilidad en tu región de origen).
   * **Claves SSH**: Genera un par de llaves y descarga la clave privada (`.key`). La necesitarás para conectarte.
   * **Red**: Deja las opciones por defecto para asignarle una dirección IP pública.
4. Haz clic en **Crear** y espera a que el estado cambie a "En ejecución". Copia la **IP pública** asignada a tu instancia.

### Paso 2: Conectarse al Servidor por SSH
Abre la terminal en tu máquina local y conéctate usando tu archivo de clave descargado:
```bash
chmod 400 /ruta/a/tu/llave.key
ssh -i /ruta/a/tu/llave.key ubuntu@<IP_PUBLICA_DE_TU_VPS>
```

### Paso 3: Instalar Dependencias del Sistema
Una vez dentro del servidor, ejecuta los siguientes comandos para actualizar el sistema e instalar **Node.js**:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl build-essential

# Instalar Node.js LTS (v20 o v22)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

#### Instalar Librerías Requeridas por Puppeteer (Chromium Headless)
Debido a que `whatsapp-web.js` utiliza Puppeteer para emular una pestaña de WhatsApp Web, Chromium necesita una serie de dependencias gráficas y de sistema para correr en modo sin cabeza (headless) en Linux. Instálalas ejecutando:
```bash
sudo apt install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget libgbm-dev
```

### Paso 4: Descargar y Configurar el Bot
1. Clona tu repositorio de GitHub en el servidor:
   ```bash
   git clone https://github.com/tu-usuario/whatsapp-personal-bot.git
   cd whatsapp-personal-bot
   ```
2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```
3. Si utilizas la sincronización con Google Calendar, crea el archivo de credenciales:
   ```bash
   nano googleCredentials.json
   ```
   Pega el contenido JSON de tu cuenta de servicio y guárdalo (Ctrl+O, Enter, Ctrl+X).

### Paso 5: Escanear el Código QR y Mantener el Bot en Ejecución
Para asegurarte de que el bot siga funcionando incluso después de cerrar la terminal SSH, utilizaremos **PM2** (un administrador de procesos para Node.js):

1. Instala PM2 de forma global:
   ```bash
   sudo npm install -g pm2
   ```
2. Inicia el bot a través de PM2:
   ```bash
   pm2 start index.js --name "whatsapp-bot"
   ```
3. Para ver el código QR y escanearlo desde tu teléfono:
   ```bash
   pm2 logs whatsapp-bot
   ```
   *(Escanéalo desde WhatsApp -> Dispositivos Vinculados -> Vincular Dispositivo. Verás que en unos segundos la terminal confirma el inicio exitoso).*
4. Configura PM2 para que inicie automáticamente el bot si la VPS se llega a reiniciar:
   ```bash
   pm2 startup
   pm2 save
   ```

¡Listo! Tu bot de WhatsApp estará funcionando de manera autónoma, continua y completamente gratis en la nube de Oracle.

---

## 🔔 Configuración de Alertas de Telegram (Opcional)

Puedes configurar el bot para que envíe notificaciones importantes a un chat de Telegram, como alertas de vinculación, desconexiones y problemas de conexión detectados por el heartbeat. Esto es especialmente útil cuando el bot corre en un VPS sin acceso directo a la terminal.

### Paso 1: Crear un Bot de Telegram
1. Abre Telegram y busca a [@BotFather](https://t.me/BotFather).
2. Envía `/newbot` y sigue las instrucciones para crear tu bot.
3. Copia el **token del bot** que te proporcionará (tiene el formato `123456789:ABCdefGhIjKlMnOpQrStUvWxYz`).

### Paso 2: Obtener tu Chat ID
1. Envía cualquier mensaje al bot que acabas de crear.
2. Visita en tu navegador: `https://api.telegram.org/bot<TU_TOKEN>/getUpdates`
3. Busca el campo `"chat":{"id": <NUMERO>}` en la respuesta JSON. Ese número es tu **Chat ID**.

### Paso 3: Configurar las credenciales
Tienes dos opciones:

**Opción A — Archivo de configuración (recomendada si usas [pm2-telegram-monitor](https://github.com/dilelu94/pm2-telegram-monitor)):**

Crea o edita el archivo `../pm2-telegram-monitor/config.json` relativo a la carpeta del bot:
```json
{
    "botToken": "TU_TOKEN_DE_TELEGRAM",
    "chatId": "TU_CHAT_ID",
    "whatsappPairingNumber": "5491100000000"
}
```

> **Nota:** La clave `whatsappPairingNumber` es opcional. Si se define, el bot usará vinculación por **código de 8 dígitos** en lugar de QR. Debe ser tu número de WhatsApp con código de país, sin `+` ni espacios (ej. `5491100000000`).

**Opción B — Variables de entorno:**
```bash
export TELEGRAM_BOT_TOKEN="TU_TOKEN_DE_TELEGRAM"
export TELEGRAM_CHAT_ID="TU_CHAT_ID"
export WHATSAPP_PAIRING_NUMBER="5491100000000"  # Opcional
```

### ¿Qué alertas recibirás?
| Alerta | Descripción |
|--------|-------------|
| 🔗 **Código de vinculación** | Se envía el código de 8 dígitos con instrucciones paso a paso para vincular tu WhatsApp. Si el código rota, se edita el mismo mensaje para evitar spam. |
| 📸 **Código QR** | Si no configuraste `whatsappPairingNumber`, se envía una foto del QR a Telegram. Si rota, se edita la misma foto. |
| ✅ **Vinculación exitosa** | Confirma que el dispositivo se vinculó correctamente. |
| 🛑 **Desconexión** | Alerta cuando la sesión de WhatsApp se desconecta, incluyendo la razón. El bot se reinicia automáticamente vía PM2. |
| ⚠️ **Heartbeat** | El bot verifica la conexión cada 10 minutos. Si detecta un estado anormal o un navegador congelado, alerta y se reinicia automáticamente. |
| 🔄 **Reporte de inicio** | Al reiniciar, si hay mensajes que se enviaron retroactivamente o que vencieron, se envía un resumen consolidado. |

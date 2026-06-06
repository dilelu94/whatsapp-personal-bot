FROM node:20-slim

# Instalar Chromium y dependencias de fuentes para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Configurar variables de entorno requeridas para Puppeteer y Docker
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copiar archivos de dependencias e instalar
COPY package*.json ./
RUN npm ci --only=production

# Copiar el código del bot
COPY . .

# Configurar rutas por defecto en Docker para usar un solo volumen persistente
ENV DB_PATH=/usr/src/app/data/storage.json
ENV WWEBJS_AUTH_PATH=/usr/src/app/data/.wwebjs_auth
ENV MEDIA_DIR=/usr/src/app/data/media
ENV GOOGLE_CREDENTIALS_PATH=/usr/src/app/data/googleCredentials.json

# Crear carpeta de datos persistentes
RUN mkdir -p /usr/src/app/data

# Definir volumen
VOLUME ["/usr/src/app/data"]

CMD ["node", "index.js"]

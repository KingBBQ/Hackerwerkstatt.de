# Beispiel-Dockerfile für Hackerwerkstatt
# Passe es an dein Projekt an!

FROM node:18-alpine

WORKDIR /app

# Dependencies installieren
COPY package*.json ./
RUN npm install --omit=dev

# App-Code kopieren
COPY . .

# Port den deine App nutzt (muss mit der Deploy-Konfiguration übereinstimmen)
EXPOSE 80

CMD ["node", "server.js"]

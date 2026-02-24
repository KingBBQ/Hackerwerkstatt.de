# Hackerwerkstatt Projekt-Template

Dieses Template ist der Startpunkt für dein eigenes Projekt auf der Hackerwerkstatt-Plattform.
Forke oder kopiere dieses Repository und passe es an dein Projekt an.

## Schnellstart

1. **Repository erstellen** - Erstelle ein öffentliches Git-Repository (z.B. auf GitHub)
2. **Code schreiben** - Ersetze `server.js` mit deiner eigenen Web-App
3. **Dockerfile anpassen** - Stelle sicher, dass dein Dockerfile deine App korrekt baut
4. **Auf Hackerwerkstatt deployen** - Gib die Repo-URL im Dashboard ein und klicke "Deploy"

## Projektstruktur

```
├── Dockerfile      # Baut deinen Docker-Container
├── server.js       # Deine Anwendung (Beispiel: einfacher HTTP-Server)
├── package.json    # Node.js Abhängigkeiten
├── .gitignore      # Dateien die Git ignoriert
└── README.md       # Diese Datei
```

## Wie funktioniert das Deployment?

Die Hackerwerkstatt-Plattform nutzt **One-Click Deployment**:

1. Du gibst deine öffentliche Git-Repo-URL und eine Wunsch-Subdomain ein
2. Die Plattform klont dein Repository
3. Dein `Dockerfile` wird gebaut (`docker build`)
4. Der Container wird gestartet und automatisch unter `https://deine-subdomain.hackerwerkstatt.de` verfügbar
5. **HTTPS wird automatisch** von Caddy bereitgestellt - du musst dich um nichts kümmern

### Was passiert bei einem Re-Deploy?

Wenn du Änderungen an deinem Code machst und erneut "Deploy" klickst:
- Die Plattform pullt die neuesten Änderungen aus deinem Git-Repo
- Der Container wird neu gebaut und gestartet
- Eventuelle Konflikte werden automatisch erkannt und angezeigt

## Anforderungen an dein Projekt

### Pflicht: Dockerfile

Dein Repository **muss** ein `Dockerfile` im Root-Verzeichnis enthalten. Dieses definiert, wie dein Projekt gebaut wird.

### Port-Konfiguration

Deine App muss auf einem Port lauschen. Der Standard ist **Port 80**, du kannst aber jeden Port verwenden.
Gib den Port im Dashboard unter "Port" an.

Beispiel für Port 80:
```javascript
const server = http.createServer(handler);
server.listen(80);
```

Beispiel für Port 3000:
```javascript
app.listen(3000);
// -> Im Dashboard Port 3000 angeben
```

### Dockerfile-Beispiele

**Node.js App:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 80
CMD ["node", "server.js"]
```

**Python Flask App:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 80
CMD ["python", "app.py"]
```

**Statische Website (HTML/CSS/JS):**
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

**Go App:**
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 80
CMD ["./server"]
```

## Technische Details

### Architektur

```
Internet
   │
   ▼
┌─────────┐     ┌──────────────────────┐
│  Caddy   │────▶│  dein-container       │
│  (Proxy) │     │  hw-<username>        │
└─────────┘     └──────────────────────┘
     │                    │
     │           Docker-Netzwerk: "web"
     │                    │
     ▼                    ▼
 Auto-HTTPS        Dein Port (z.B. 80)
```

### Docker-Netzwerk

Alle Projekte laufen im gleichen Docker-Netzwerk `web`. Caddy erkennt neue Container automatisch über Docker-Labels und richtet das Routing + HTTPS ein.

### Generierte docker-compose.yml

Die Plattform erstellt automatisch folgende Compose-Konfiguration für dein Projekt:

```yaml
services:
  app:
    build: /srv/deployments/<username>/repo
    container_name: hw-<username>
    restart: unless-stopped
    networks:
      - web
    labels:
      caddy: <subdomain>.hackerwerkstatt.de
      caddy.reverse_proxy: "{{upstreams <port>}}"

networks:
  web:
    external: true
```

### KI-Fehleranalyse (optional)

Wenn ein Deployment fehlschlägt, kann die Plattform den Fehler automatisch analysieren:
- Hinterlege einen **Anthropic API Key** im Dashboard
- Bei Build- oder Deploy-Fehlern wird der Log automatisch an Claude geschickt
- Du erhältst konkrete Lösungsvorschläge auf Deutsch

## Tipps

- **Teste lokal**: Bau und starte deinen Container lokal mit `docker build -t test . && docker run -p 8080:80 test`, bevor du deployest
- **Logs prüfen**: Das Deployment-Log im Dashboard zeigt dir genau, was passiert
- **Port beachten**: Stelle sicher, dass der Port in deiner App mit dem im Dashboard übereinstimmt
- **Keine Secrets im Repo**: Verwende niemals API-Keys oder Passwörter direkt im Code
- **Kleine Images**: Nutze Alpine-basierte Base-Images (`node:18-alpine`, `python:3.11-slim`) für schnellere Builds

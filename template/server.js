// Minimal-Beispiel: Einfacher Webserver
// Ersetze dies mit deiner eigenen App!

const http = require('http');

const PORT = process.env.PORT || 80;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Mein Projekt</title></head>
        <body style="background:#0d0d0d;color:#0f0;font-family:monospace;display:flex;justify-content:center;align-items:center;min-height:100vh;">
            <div style="text-align:center;">
                <h1>Hackerwerkstatt Projekt</h1>
                <p>Dein Projekt läuft!</p>
                <p>Bearbeite server.js um deine eigene App zu bauen.</p>
            </div>
        </body>
        </html>
    `);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

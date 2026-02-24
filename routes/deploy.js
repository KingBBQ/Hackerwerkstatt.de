const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const db = require('../database');

const execAsync = promisify(exec);
const router = express.Router();

const DEPLOY_BASE = process.env.DEPLOY_BASE_PATH || '/srv/deployments';

// --- Middleware ---

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) return next();
    res.status(401).json({ error: 'Nicht eingeloggt.' });
};

const isVerified = (req, res, next) => {
    if (req.session.userId) {
        dbGet("SELECT is_verified FROM users WHERE id = ?", [req.session.userId])
            .then(row => {
                if (row && row.is_verified === 1) return next();
                res.status(403).json({ error: 'Account noch nicht freigeschaltet. Bitte wende dich an einen Admin.' });
            })
            .catch(() => res.status(500).json({ error: 'Datenbankfehler.' }));
    } else {
        res.status(401).json({ error: 'Nicht eingeloggt.' });
    }
};

// --- DB Helpers (promisified) ---

function dbGet(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
    });
}

function dbRun(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
    });
}

// --- Shell Escape ---

function shellQuote(s) {
    return "'" + s.replace(/'/g, "'\"'\"'") + "'";
}

// --- Validation ---

const VALID_GIT_URL = /^https:\/\/[\w.-]+\.[a-z]{2,}(\/[\w.@:~/-]+)*(\.git)?$/i;
const VALID_SUBDOMAIN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

// --- Routes ---

// Save deployment config
router.post('/config', isAuthenticated, isVerified, async (req, res) => {
    try {
        const { gitRepo, subdomain, appPort, aiApiKey } = req.body;

        if (!gitRepo || !VALID_GIT_URL.test(gitRepo.trim())) {
            return res.status(400).json({ error: 'Ungültige Git-Repo-URL. Nur HTTPS-URLs erlaubt.' });
        }

        const cleanSubdomain = (subdomain || '').trim().toLowerCase();
        if (!cleanSubdomain || !VALID_SUBDOMAIN.test(cleanSubdomain)) {
            return res.status(400).json({ error: 'Ungültige Subdomain. Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt.' });
        }

        // Reserved subdomains
        const reserved = ['www', 'mail', 'ftp', 'admin', 'api', 'demo', 'hackerwerkstatt'];
        if (reserved.includes(cleanSubdomain)) {
            return res.status(400).json({ error: 'Diese Subdomain ist reserviert.' });
        }

        const port = parseInt(appPort) || 80;
        if (port < 1 || port > 65535) {
            return res.status(400).json({ error: 'Ungültiger Port (1-65535).' });
        }

        // Check subdomain not taken by another user
        const existing = await dbGet(
            "SELECT id FROM users WHERE subdomain = ? AND id != ?",
            [cleanSubdomain, req.session.userId]
        );
        if (existing) {
            return res.status(409).json({ error: 'Subdomain bereits von einem anderen User belegt.' });
        }

        await dbRun(
            "UPDATE users SET git_repo = ?, subdomain = ?, app_port = ?, ai_api_key = ? WHERE id = ?",
            [gitRepo.trim(), cleanSubdomain, port, aiApiKey ? aiApiKey.trim() : null, req.session.userId]
        );

        res.json({ message: 'Konfiguration gespeichert.' });
    } catch (err) {
        console.error('Config error:', err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Get deployment config and status
router.get('/config', isAuthenticated, async (req, res) => {
    try {
        const row = await dbGet(
            "SELECT git_repo, subdomain, app_port, deploy_status, deploy_log, ai_api_key, is_verified FROM users WHERE id = ?",
            [req.session.userId]
        );
        res.json({
            gitRepo: row.git_repo || '',
            subdomain: row.subdomain || '',
            appPort: row.app_port || 80,
            status: row.deploy_status || 'none',
            log: row.deploy_log || '',
            hasAiKey: !!row.ai_api_key,
            isVerified: row.is_verified === 1
        });
    } catch (err) {
        console.error('Config fetch error:', err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Start deployment
router.post('/start', isAuthenticated, isVerified, async (req, res) => {
    try {
        const user = await dbGet(
            "SELECT username, git_repo, subdomain, app_port, ai_api_key, deploy_status FROM users WHERE id = ?",
            [req.session.userId]
        );

        if (!user.git_repo || !user.subdomain) {
            return res.status(400).json({ error: 'Bitte zuerst Git-Repo und Subdomain konfigurieren.' });
        }
        if (user.deploy_status === 'deploying') {
            return res.status(409).json({ error: 'Deployment läuft bereits.' });
        }

        // Set status to deploying
        await dbRun("UPDATE users SET deploy_status = 'deploying', deploy_log = '' WHERE id = ?", [req.session.userId]);
        res.json({ message: 'Deployment gestartet.' });

        // Run deployment async (don't await - runs in background)
        runDeployment(req.session.userId, user).catch(err => {
            console.error('Deployment error:', err);
        });
    } catch (err) {
        console.error('Start error:', err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Get deployment status (for polling)
router.get('/status', isAuthenticated, async (req, res) => {
    try {
        const row = await dbGet(
            "SELECT deploy_status, deploy_log FROM users WHERE id = ?",
            [req.session.userId]
        );
        res.json({
            status: row.deploy_status || 'none',
            log: row.deploy_log || ''
        });
    } catch (err) {
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// Stop deployment
router.post('/stop', isAuthenticated, isVerified, async (req, res) => {
    try {
        const user = await dbGet(
            "SELECT username, subdomain FROM users WHERE id = ?",
            [req.session.userId]
        );

        const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();
        const projectDir = path.join(DEPLOY_BASE, safeUsername);
        const composePath = path.join(projectDir, 'docker-compose.generated.yml');
        const projectName = `hw-${safeUsername}`;

        try {
            await execAsync(
                `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(composePath)} down --remove-orphans`,
                { timeout: 60000 }
            );
            await dbRun("UPDATE users SET deploy_status = 'stopped', deploy_log = deploy_log || '\nProjekt gestoppt.\n' WHERE id = ?", [req.session.userId]);
            res.json({ message: 'Projekt gestoppt.' });
        } catch (e) {
            await dbRun("UPDATE users SET deploy_status = 'error', deploy_log = deploy_log || ? WHERE id = ?",
                [`\nStop-Fehler: ${e.message}\n`, req.session.userId]);
            res.status(500).json({ error: 'Fehler beim Stoppen: ' + e.message });
        }
    } catch (err) {
        console.error('Stop error:', err);
        res.status(500).json({ error: 'Serverfehler.' });
    }
});

// AI error analysis
router.post('/analyze', isAuthenticated, async (req, res) => {
    try {
        const row = await dbGet("SELECT ai_api_key, deploy_log FROM users WHERE id = ?", [req.session.userId]);
        if (!row.ai_api_key) {
            return res.status(400).json({ error: 'Kein KI-API-Key hinterlegt.' });
        }

        const analysis = await analyzeWithAI(row.ai_api_key, row.deploy_log);
        await dbRun("UPDATE users SET deploy_log = deploy_log || ? WHERE id = ?",
            [`\n--- KI-ANALYSE ---\n${analysis}\n--- ENDE ANALYSE ---\n`, req.session.userId]);
        res.json({ analysis });
    } catch (err) {
        console.error('Analyze error:', err);
        res.status(500).json({ error: 'KI-Analyse fehlgeschlagen: ' + err.message });
    }
});

// --- Deployment Logic ---

async function appendLog(userId, text) {
    await dbRun("UPDATE users SET deploy_log = deploy_log || ? WHERE id = ?", [text + '\n', userId]);
}

async function setStatus(userId, status) {
    await dbRun("UPDATE users SET deploy_status = ? WHERE id = ?", [status, userId]);
}

async function runDeployment(userId, user) {
    const safeUsername = user.username.replace(/[^a-z0-9]/gi, '').toLowerCase();
    const projectDir = path.join(DEPLOY_BASE, safeUsername);
    const repoDir = path.join(projectDir, 'repo');
    const composePath = path.join(projectDir, 'docker-compose.generated.yml');
    const projectName = `hw-${safeUsername}`;

    try {
        // 1. Create deployment directory
        await fs.mkdir(projectDir, { recursive: true });
        await appendLog(userId, `[1/5] Deployment-Verzeichnis: ${projectDir}`);

        // 2. Clone or pull
        let repoExists = false;
        try {
            await fs.access(path.join(repoDir, '.git'));
            repoExists = true;
        } catch { }

        if (repoExists) {
            await appendLog(userId, '[2/5] Repository existiert, pull Updates...');
            try {
                // Detect and handle local changes / conflicts
                const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: repoDir, timeout: 10000 });
                if (statusOut.trim()) {
                    await appendLog(userId, 'WARNUNG: Lokale Änderungen erkannt. Setze zurück...');
                    await execAsync('git checkout -- . && git clean -fd', { cwd: repoDir, timeout: 15000 });
                    await appendLog(userId, 'Lokale Änderungen entfernt.');
                }

                // Fetch and reset to remote
                const { stderr: fetchErr } = await execAsync('git fetch origin', { cwd: repoDir, timeout: 120000 });
                if (fetchErr) await appendLog(userId, fetchErr);

                const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoDir, timeout: 5000 });
                const branch = branchOut.trim() || 'main';

                const { stdout: resetOut, stderr: resetErr } = await execAsync(
                    `git reset --hard origin/${branch}`,
                    { cwd: repoDir, timeout: 30000 }
                );
                if (resetOut) await appendLog(userId, resetOut.trim());
                if (resetErr) await appendLog(userId, resetErr.trim());
                await appendLog(userId, 'Pull erfolgreich.');

            } catch (pullErr) {
                await appendLog(userId, `Pull-Fehler: ${pullErr.message}`);
                await appendLog(userId, 'Versuche vollständigen Neu-Clone...');
                await fs.rm(repoDir, { recursive: true, force: true });
                const { stderr } = await execAsync(
                    `git clone ${shellQuote(user.git_repo)} ${shellQuote(repoDir)}`,
                    { timeout: 120000 }
                );
                if (stderr) await appendLog(userId, stderr);
                await appendLog(userId, 'Neu-Clone erfolgreich.');
            }
        } else {
            await appendLog(userId, '[2/5] Klone Repository...');
            const { stdout, stderr } = await execAsync(
                `git clone ${shellQuote(user.git_repo)} ${shellQuote(repoDir)}`,
                { timeout: 120000 }
            );
            if (stdout) await appendLog(userId, stdout.trim());
            if (stderr) await appendLog(userId, stderr.trim());
            await appendLog(userId, 'Clone erfolgreich.');
        }

        // 3. Check for Dockerfile
        await appendLog(userId, '[3/5] Prüfe Dockerfile...');
        try {
            await fs.access(path.join(repoDir, 'Dockerfile'));
            await appendLog(userId, 'Dockerfile gefunden.');
        } catch {
            await appendLog(userId, 'FEHLER: Kein Dockerfile im Repository-Root gefunden!');
            await appendLog(userId, 'Dein Repository muss ein Dockerfile enthalten.');
            await appendLog(userId, 'Tipp: Nutze das Hackerwerkstatt-Template als Vorlage.');
            await setStatus(userId, 'error');
            await maybeAutoAnalyze(userId, user.ai_api_key);
            return;
        }

        // 4. Generate docker-compose.yml
        await appendLog(userId, '[4/5] Erstelle Docker-Compose-Konfiguration...');
        const port = user.app_port || 80;
        const composeContent = generateCompose(safeUsername, user.subdomain, repoDir, port);
        await fs.writeFile(composePath, composeContent);
        await appendLog(userId, 'docker-compose.generated.yml erstellt:');
        await appendLog(userId, '---');
        await appendLog(userId, composeContent);
        await appendLog(userId, '---');

        // 5. Build and deploy
        await appendLog(userId, '[5/5] Build und Deploy...');

        // Build
        await appendLog(userId, 'docker compose build...');
        try {
            const { stdout, stderr } = await execAsync(
                `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(composePath)} build --no-cache`,
                { timeout: 600000 } // 10 min timeout for build
            );
            if (stdout) await appendLog(userId, stdout.trim());
            if (stderr) await appendLog(userId, stderr.trim());
            await appendLog(userId, 'Build erfolgreich.');
        } catch (buildErr) {
            await appendLog(userId, `BUILD-FEHLER:\n${buildErr.stderr || buildErr.message}`);
            await setStatus(userId, 'error');
            await maybeAutoAnalyze(userId, user.ai_api_key);
            return;
        }

        // Deploy
        await appendLog(userId, 'docker compose up -d...');
        try {
            const { stdout, stderr } = await execAsync(
                `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(composePath)} up -d --force-recreate`,
                { timeout: 120000 }
            );
            if (stdout) await appendLog(userId, stdout.trim());
            if (stderr) await appendLog(userId, stderr.trim());
            await appendLog(userId, '');
            await appendLog(userId, `Deployment erfolgreich!`);
            await appendLog(userId, `Dein Projekt ist erreichbar unter: https://${user.subdomain}.hackerwerkstatt.de`);
            await setStatus(userId, 'running');
        } catch (upErr) {
            await appendLog(userId, `DEPLOY-FEHLER:\n${upErr.stderr || upErr.message}`);
            await setStatus(userId, 'error');
            await maybeAutoAnalyze(userId, user.ai_api_key);
        }

    } catch (err) {
        await appendLog(userId, `UNERWARTETER FEHLER: ${err.message}`);
        await setStatus(userId, 'error');
        await maybeAutoAnalyze(userId, user.ai_api_key);
    }
}

function generateCompose(username, subdomain, repoDir, port) {
    return `# Auto-generated by Hackerwerkstatt One-Click Deploy
services:
  app:
    build: ${repoDir}
    container_name: hw-${username}
    restart: unless-stopped
    networks:
      - web
    labels:
      caddy: ${subdomain}.hackerwerkstatt.de
      caddy.reverse_proxy: "{{upstreams ${port}}}"

networks:
  web:
    external: true
`;
}

// --- AI Error Analysis ---

async function maybeAutoAnalyze(userId, aiApiKey) {
    if (!aiApiKey) return;
    try {
        const row = await dbGet("SELECT deploy_log FROM users WHERE id = ?", [userId]);
        const analysis = await analyzeWithAI(aiApiKey, row.deploy_log);
        await appendLog(userId, `\n--- KI-ANALYSE ---\n${analysis}\n--- ENDE ANALYSE ---`);
    } catch (e) {
        await appendLog(userId, `\nKI-Analyse fehlgeschlagen: ${e.message}`);
    }
}

function analyzeWithAI(apiKey, errorLog) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Du bist ein Docker/Deployment-Experte. Analysiere dieses Deployment-Log und erkläre den Fehler auf Deutsch. Gib konkrete, praktische Lösungsvorschläge:\n\n${errorLog.slice(-4000)}`
            }]
        });

        const req = https.request({
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.content[0].text);
                    } catch (e) {
                        reject(new Error('Ungültige API-Antwort'));
                    }
                } else {
                    reject(new Error(`API-Fehler ${res.statusCode}: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('API-Timeout'));
        });
        req.write(body);
        req.end();
    });
}

module.exports = router;

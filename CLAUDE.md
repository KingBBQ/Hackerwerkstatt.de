# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hackerwerkstatt.de is a German-language web platform for managing participants and one-click Docker deployments in a "Hacker Workshop" course. Users register, get verified by an admin, then deploy their own Dockerized apps with automatic HTTPS via Caddy reverse proxy.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Development server with nodemon auto-reload (port 3000)
npm start            # Production server (port 3000)
./test_api.sh        # Run API tests (curl-based)

# Docker deployment
docker network create web
docker compose up -d --build

# Promote a user to admin
docker compose exec hackerwerkstatt node make_admin.js <username>
```

No linter or test framework is configured — tests are shell-based API calls in `test_api.sh`.

## Architecture

**Backend:** Node.js 18 + Express.js with SQLite3 (file: `hackerwerkstatt.db`).
**Frontend:** Vanilla HTML/CSS/JS served from `public/` — terminal/hacker theme with glitch effects. No build step.
**Deployment infra:** Docker Compose + Caddy with caddy-docker-proxy for automatic HTTPS via Docker labels.

### Route structure (`routes/`)

| File | Prefix | Purpose |
|------|--------|---------|
| `auth.js` | `/auth` | Register, login, logout, session info |
| `user.js` | `/user` | SSH key management |
| `admin.js` | `/admin` | User verification, deletion, SSH setup script generation |
| `deploy.js` | `/deploy` | One-click deployment (config, start, stop, status, AI error analysis) |

### Auth model

Session-based auth (`express-session` with cookies). Three middleware guards used across routes:
- `isAuthenticated` — checks `req.session.userId`
- `isAdmin` — checks `req.session.isAdmin === 1`
- `isVerified` — queries DB for `is_verified` flag

### Deployment flow

1. User saves deploy config (git repo URL, subdomain, port)
2. `POST /deploy/start` triggers async process: clone repo → check for Dockerfile → generate docker-compose.yml with Caddy labels → `docker compose build` → `docker compose up -d`
3. Frontend polls `GET /deploy/status` for real-time log updates
4. On failure, if user has configured an Anthropic API key, Claude analyzes the error log (model: `claude-sonnet-4-20250514`)

Deployments land in `/srv/deployments/<username>/` on the host. The app container mounts the Docker socket to manage user containers.

### Database (`database.js`)

Single `users` table in SQLite with migration support (silently ignores duplicate column errors on re-run). Key fields: `username`, `password_hash` (bcrypt), `ssh_key`, `is_admin`, `is_verified`, `git_repo`, `subdomain`, `app_port`, `deploy_status`, `deploy_log`, `ai_api_key`.

### Key patterns

- `deploy.js` uses promisified DB helpers (`dbGet`, `dbRun`) and `execAsync` (promisified `child_process.exec`) for shell commands
- Username sanitization: `username.replace(/[^a-z0-9]/gi, '').toLowerCase()`
- UI and user-facing messages are in **German**
- `template/` directory contains a starter project given to users as a reference

## Environment

- `PORT` — server port (default: 3000)
- `DEPLOY_BASE_PATH` — where user deployments are stored (default: `/srv/deployments`)
- Session secret is hardcoded in `server.js` — should be set via env var in production

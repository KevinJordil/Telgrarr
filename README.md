# Telgrarr

Webhook-driven notification bridge between **Sonarr** / **Radarr** and
**Telegram**, with optional **Emby** library refresh and multi-tier
translation for Arabic captions. Mobile-first React GUI for configuration,
template preview, and a live event feed.

## What It Does

When Sonarr or Radarr finishes a download, Telgrarr:

1. Receives the `Download` webhook event.
2. Batches new arrivals within a configurable window (default 3 minutes).
3. Enriches the metadata (TMDB primary, OMDb fallback).
4. Translates the synopsis to Arabic (LLM -> DeepL -> Google -> graceful
   degradation).
5. Renders a Telegram caption from a template (English or Arabic; custom
   templates supported).
6. Dispatches the caption to your Telegram chat.
7. Optionally triggers an Emby library refresh.

A built-in React GUI handles configuration, template preview, queue
inspection, history, blacklist management, and a live SSE event feed.

## Quick Start (Docker)

~~~bash
git clone https://github.com/Fahad-Beta/telgrarr.git
cd telgrarr
cp .env.example .env
# Edit .env (all optional): WEBHOOK_SECRET auto-generates; set TRUST_PROXY=true if you
# will be running behind a reverse proxy / TLS terminator.
docker compose up -d --build
docker compose exec telgrarr node setup-auth.js   # first-run auth bootstrap
~~~

Telgrarr is now serving on `http://localhost:3400`. Open it in a browser,
log in with the credentials you just created, and finish configuration
(Sonarr / Radarr / Telegram / TMDB) through the GUI Settings page.

## Installation (Manual)

Requirements:

- **Node.js 22** or newer (see `.nvmrc`)
- A writable directory for persistent state (defaults to `./data`)

~~~bash
git clone https://github.com/Fahad-Beta/telgrarr.git
cd telgrarr
nvm use                            # or install Node 22+ manually

# Backend
npm install

# GUI build
cd gui && npm install && npm run build && cd ..

# Configuration
cp .env.example .env
$EDITOR .env                       # optional overrides (WEBHOOK_SECRET auto-generates)

# First-run auth (interactive, hidden prompt)
node setup-auth.js

# Run
npm start                          # node src/index.js
~~~

## Configuration

Telgrarr resolves settings in this precedence order:

~~~
process environment  >  .env  >  data/config.json  >  built-in defaults
~~~

The `.env` loader never overrides a variable already set in the process
environment, so values injected by PM2 / systemd / Docker compose always
win.

### Environment Variables

| Variable          | Default              | Description |
| ----------------- | -------------------- | ----------- |
| `DATA_DIR`        | `<project>/data`     | Where all persistent state lives (config, queue, auth, sessions, ledger). |
| `PORT`            | `3400`               | HTTP listen port. If it is already in use, Telgrarr logs one fatal line and exits non-zero (no GUI starts); set a free port via this variable or `.env`, then restart. The in-GUI Port field applies only after a successful boot. |
| `HOST`            | `0.0.0.0`            | HTTP listen address. |
| `CORS_ORIGIN`     | _(unset)_            | Empty -> no CORS header -> same-origin only (correct when this process serves the GUI). Set to exactly one origin (scheme + host + port) if the GUI is hosted separately. |
| `TRUST_PROXY`     | _(off)_              | Express `trust proxy`. Empty / `false` / `0` = off. `true` / `1` = trust one proxy. Numeric N = N hops. IP / CIDR / list also accepted. |
| `WEBHOOK_SECRET`  | _(unset)_            | The webhook auth secret, like an *arr API key. **Auto-generated on first boot** and managed in the GUI (Settings -> System -> Server: reveal / copy / Regenerate). A set value only seeds the first run; the saved value is authoritative thereafter. |
| `COOKIE_SECURE`   | `auto`               | Session-cookie `Secure` flag. `auto` sets Secure on HTTPS requests (direct or via `X-Forwarded-Proto`); `true` / `false` force on / off. |
| `NODE_ENV`        | `production`         | Standard Node convention. Use `production` for any real deployment. |

Integration settings (Sonarr / Radarr / Emby / Telegram / TMDB / OMDb
base URLs, API keys, tokens, chat IDs) live in `data/config.json` and
are configured through the GUI Settings page after first run.

### First-Run Auth

`setup-auth.js` is an interactive CLI that creates `data/auth.json` with
a scrypt-hashed credential pair:

~~~bash
node setup-auth.js
# Username: <your username>
# Password: <hidden>
# Confirm password: <hidden>
~~~

The password prompt is echo-suppressed and never appears in shell
history or process listings. Re-run any time to rotate.

## Webhook Setup

The webhook secret is auto-generated on first run - copy the ready-made URLs from **Settings -> System -> Server** (reveal to see the secret). To build them by hand, configure Sonarr / Radarr to POST to:

~~~
https://<your-host>/hooks/<WEBHOOK_SECRET>/sonarr
https://<your-host>/hooks/<WEBHOOK_SECRET>/radarr
~~~

Method: `POST`. Trigger: **On Import** (both Sonarr and Radarr).
Telgrarr filters on `eventType === 'Download'` and ignores everything
else.

## Running

Telgrarr is process-manager agnostic. Pick whichever fits your setup.

### Plain Node

~~~bash
npm start
~~~

### PM2

~~~bash
cp ecosystem.config.example.js ecosystem.config.js
$EDITOR ecosystem.config.js        # set env, cwd, interpreter path
pm2 start ecosystem.config.js
~~~

`pm2 reload telgrarr` is a fork-mode restart and carries a brief
origin-down window of roughly a second. The single-instance lock uses a
30-second stale-lock allowance and short acquire retries to keep that
handoff smooth.

### systemd

~~~ini
# /etc/systemd/system/telgrarr.service  (a user unit works too)
[Unit]
Description=Telgrarr
After=network.target

[Service]
Type=simple
User=telgrarr
WorkingDirectory=/opt/telgrarr
EnvironmentFile=/opt/telgrarr/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
~~~

### Docker / Docker Compose

The included `Dockerfile` is a multi-stage Alpine build that produces a
slim runtime image. The included `docker-compose.yml` defines a single
service with one named volume (`telgrarr-data` -> `/data`) and one
user-defined network (`telgrarr-net`):

~~~bash
docker compose up -d --build
docker compose logs -f telgrarr
docker compose exec telgrarr node setup-auth.js
~~~

The container runs as a non-root user (UID/GID 1000), drops all Linux
capabilities, and sets `no-new-privileges`. `HEALTHCHECK` polls
`/health` every 30s.

## Reverse Proxy + TLS

Telgrarr serves plain HTTP. Put it behind a reverse proxy for TLS
termination. A Cloudflare tunnel, Caddy, nginx, or Traefik all work; the
only requirements are:

1. Set `TRUST_PROXY=true` in `.env` so Express honors `X-Forwarded-*`
   headers (needed for correct IP attribution in login throttling).
2. Ensure the proxy forwards `X-Forwarded-Proto` so `COOKIE_SECURE=auto`
   correctly flags the session cookie as `Secure` over HTTPS.

For Caddy:

~~~caddy
telgrarr.example.com {
    reverse_proxy localhost:3400
}
~~~

For a Cloudflare tunnel, point the public hostname at
`http://localhost:3400`. Cloudflare terminates TLS; Telgrarr sees plain
HTTP with `X-Forwarded-Proto: https`.

## Operational Notes

- **Backups**: enabled by default, runs every 7 days, retains the last 5.
  Backups land in `<project>/backups/` (or inside the container in a
  Docker deployment — mount that path explicitly if you need offsite
  copies). The manifest covers config, templates, auth, sessions,
  blacklist, history, recovery, ledger, and the event ring buffer. The
  regenerable media cache is excluded.
- **Logs** live in `<project>/logs/` (`app.log`, `error.log`, `audit.log`)
  with size-based rotation.
- **Recovery**: `npm run recover` runs `scripts/gen-recovery.js`, which writes a single-use, 15-minute
    password-reset token to `recovery.json` under `DATA_DIR`. Enter it in the
    GUI **Forgot Password** dialog to set a new password; the token is burned
    on first use. (Automatic crash/queue recovery is separate and runs on boot.)
- **Single-instance**: a file lock on `<DATA_DIR>/.telgrarr.lock`
  prevents two processes from sharing one data directory. A second
  instance fails fast on boot.
- **Version bumps**: `node release-manager.js <patch|minor|major|beta-bump>`
  bumps `package.json` and appends to the `data/system-release.json`
  ledger atomically. Restart through your process manager to load the
  new version — the script does not auto-reload.

## Development

~~~bash
# Backend in one terminal
npm start

# Vite dev server in another (HMR + /api proxy)
cd gui
DEV_PROXY_TARGET=http://localhost:3400 npm run dev
~~~

The Vite dev server listens on `5173` and proxies `/api/*` to the
backend. Set `DEV_ALLOWED_HOSTS` (comma-separated) if you need to access
the dev server from a non-localhost host.

Tests:

~~~bash
npm run test:run                   # vitest — full unit suite
npm run test:e2e                   # Playwright end-to-end smoke
~~~

See [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions and PR
guidance.

## Project Structure

~~~
src/                Backend
  auth/             Credentials, rate-limit, session cookie, stream ticket, webhook token
  routes/           Express route modules (one per resource)
  services/         Orchestration (connection tester, enricher, notifications)
  settings/         Schema-driven validation, serializer, policy, secrets
  middlewares/      Express-specific concerns (auth, request logger)
  templates/        Default caption layouts
gui/                React frontend (Vite + Tailwind + Zustand)
shared/             Cross-cutting contracts (event names)
scripts/            Operator utilities (recovery)
tests/              vitest unit tests + Playwright e2e
data/               Persistent runtime state (git-ignored)
logs/               Application logs (git-ignored)
backups/            Backup archives (git-ignored)
~~~

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for
setup, conventions, and pull-request guidance.

## License

[MIT](LICENSE) (c) 2026 Fahad-Beta

## Security

Report vulnerabilities through GitHub's private security advisory system,
not public issues. See [SECURITY.md](SECURITY.md).

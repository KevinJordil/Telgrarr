# Telgrarr

Webhook-driven notification bridge between **Sonarr** / **Radarr** and
**Telegram**, with optional **Emby** / **Jellyfin** library refresh and
multi-language caption support.

Mobile-first React GUI for configuration, template customization, queue
inspection, and a live event feed.

## What It Does

When Sonarr or Radarr imports new media, Telgrarr:

1. Receives the import webhook.
2. Batches new arrivals within a configurable window (default 3 minutes).
3. Enriches metadata from TMDB (primary) and OMDb (fallback).
4. Translates the synopsis into the configured target language — Arabic,
   English, Spanish, French, German, or Portuguese — using a four-tier
   chain (AI LLM → DeepL → Google Translate → graceful degradation).
5. Renders a Telegram caption from a customizable template.
6. Dispatches the message to your Telegram chat, honoring rate limits and
   retrying on transient failures.
7. Optionally triggers an Emby or Jellyfin library refresh.

If Telgrarr is offline when an import occurs, it reconciles missed imports
from Sonarr / Radarr history on the next start and hourly — throttled,
de-duplicated, and lossless. Nothing is permanently missed and nothing is
double-sent.

## Quick Start (Docker)

```bash
git clone https://github.com/Fahad-Beta/telgrarr.git
cd telgrarr
cp .env.example .env
# Edit .env — all settings are optional:
#   WEBHOOK_SECRET auto-generates on first boot.
#   Set TRUST_PROXY=true if running behind a reverse proxy.
docker compose up -d --build
```

Open `http://localhost:3400` in a browser. On first launch, Telgrarr
presents an in-app setup wizard to create your admin account — no terminal
needed. Alternatively, create the account via the CLI:

```bash
docker compose exec telgrarr node setup-auth.js
```

Log in and finish configuration (Sonarr, Radarr, Telegram, TMDB) through
the GUI **Settings** page.

## Installation (Manual)

**Requirements:** Node.js 22 or newer (see `.nvmrc`), a writable directory
for persistent state (defaults to `./data`).

```bash
git clone https://github.com/Fahad-Beta/telgrarr.git
cd telgrarr
nvm use                            # or install Node 22+ manually

npm install                        # backend dependencies
cd gui && npm install && npm run build && cd ..   # build the GUI

cp .env.example .env               # optional overrides
npm start                          # node src/index.js
```

Open `http://localhost:3400` and follow the in-app setup wizard to create
your admin account. You can also use the CLI with `node setup-auth.js`
(interactive, echo-suppressed prompt). Complete the remaining configuration
(API keys, Telegram, TMDB) through the GUI **Settings** page.

## Configuration

Settings resolve in this precedence order:

```
process environment  →  .env file  →  data/config.json  →  built-in defaults
```

The `.env` loader never overrides a variable already set in the process
environment, so values injected by PM2, systemd, or Docker Compose always
win. All environment variables are resolved once at boot — changes require
a restart.

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_DIR` | `<project>/data` | Persistent state directory (config, auth, sessions, queue, templates, history). |
| `LOGS_DIR` | `<project>/logs` | Application log directory (`app.log`, `error.log`, `audit.log`). |
| `BACKUP_DIR` | `<project>/backups` | Backup archive storage. |
| `PORT` | `3400` | HTTP listen port. Also editable in the GUI (requires restart). |
| `HOST` | `0.0.0.0` | HTTP listen address (`0.0.0.0` = all interfaces, `127.0.0.1` = local only). |
| `CORS_ORIGIN` | *(empty)* | Empty = same-origin only (correct when this process serves the GUI). Set to exactly one origin (`scheme://host:port`) if the GUI is hosted separately. |
| `TRUST_PROXY` | *(off)* | Express `trust proxy`. `true` / `1` = trust one proxy hop. Numeric N = N hops. IP / CIDR also accepted. Required behind a reverse proxy for correct IP attribution and secure cookies. |
| `WEBHOOK_SECRET` | *(auto-generated)* | Webhook authentication secret, similar to a Sonarr / Radarr API key. Auto-generated on first boot and managed in the GUI (**Settings → Server**: reveal, copy, regenerate). A set env value only seeds the first boot; the saved value is authoritative thereafter. |
| `COOKIE_SECURE` | `auto` | Session-cookie `Secure` flag. `auto` enables it on HTTPS requests (direct or via `X-Forwarded-Proto`). `true` / `false` to force on or off. |
| `RESTART_CAPABLE` | *(unset)* | Declares whether the process may safely restart itself after a settings or backup-restore change that requires one. Pre-set in the Docker Compose and PM2 templates; set explicitly for systemd or a bare `docker run`. Left unset, Telgrarr still works — it just shows a "restart required" prompt in the GUI instead. |
| `NODE_ENV` | `production` | Standard Node.js convention. Use `production` for any real deployment. |

Integration settings (Sonarr / Radarr / Emby / Telegram / TMDB / OMDb
base URLs, API keys, tokens, chat IDs) live in `data/config.json` and are
configured through the GUI **Settings** page after first run.

### First-Run Authentication

Telgrarr ships with no default credentials. Create the admin account
through either of two paths:

- **GUI (recommended):** on first launch the app routes to an in-app setup
  wizard where you choose a username and password. After setup you are
  logged in automatically.
- **CLI:** run `node setup-auth.js` for an interactive, echo-suppressed
  prompt. Re-run any time to rotate credentials.

## Webhook Setup

Copy the ready-made webhook URLs from **Settings → Server** (click the eye
icon to reveal the secret, then copy).

### Sonarr

1. Open **Settings → Connect → +** and select **Webhook**.
2. **Name:** anything you like (e.g. `Telgrarr`).
3. **URL:** paste the Sonarr webhook URL from Telgrarr.
4. **Method:** POST.
5. **Notification Triggers:** enable **On Import** and **On Upgrade** only.
   Leave everything else off (On Grab, On Rename, On Series Add, On Series
   Delete, On Episode File Delete, On Health Issue, On Application Update,
   etc.).
6. Click **Test**, then **Save**.

### Radarr

1. Open **Settings → Connect → +** and select **Webhook**.
2. **Name:** anything you like (e.g. `Telgrarr`).
3. **URL:** paste the Radarr webhook URL from Telgrarr.
4. **Method:** POST.
5. **Notification Triggers:** enable **On Import** and **On Upgrade** only.
   Leave everything else off.
6. Click **Test**, then **Save**.

### Why Only On Import and On Upgrade?

**On Import** fires when a file is successfully imported into your library —
the media is on disk, metadata is available, and Emby / Jellyfin can be
refreshed. **On Upgrade** fires when a better-quality version replaces an
existing file; Telgrarr treats it as a new notification.

**On Grab** fires when a download *starts* — the file may not finish or may
fail entirely. Enabling it would produce notifications for media that never
arrives. Telgrarr ignores non-import events automatically, but disabling
them at the source avoids unnecessary webhook traffic.

> The Sonarr / Radarr **Test** button always succeeds regardless of which
> triggers are enabled.

## Resilience

Sonarr and Radarr do not retry failed webhook deliveries. If Telgrarr is
offline when an import occurs, the notification is lost at the source.
Telgrarr compensates with automatic reconciliation:

- **On boot** and **every hour**, Telgrarr queries each configured
  source's import history and identifies imports that were never announced.
- Missed imports are enqueued as regular items and flow through the same
  enrichment, translation, and dispatch pipeline.
- A per-source identity ledger ensures nothing is ever sent twice — even
  across restarts.
- Catch-up is capped at 25 items per run and drains over subsequent ticks,
  so a large backlog never floods the channel.
- Rate-limit guards on Telegram and the translation tiers prevent bot bans
  or API key throttling during bursts.

No additional configuration is required. Reconciliation uses the same
Sonarr / Radarr API keys already configured in Settings.

## Running

Telgrarr is process-manager agnostic. Pick whichever fits your setup.

### Plain Node

```bash
npm start
```

### PM2

```bash
cp ecosystem.config.example.js ecosystem.config.js
$EDITOR ecosystem.config.js        # set env, cwd, interpreter path
pm2 start ecosystem.config.js
```

`pm2 reload telgrarr` is a fork-mode restart with a brief downtime window
of roughly a second. The single-instance lock uses a 30-second stale-lock
allowance and short acquire retries to keep the handoff smooth.

### systemd

```ini
# /etc/systemd/system/telgrarr.service (a user unit works too)
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
```

### Docker / Docker Compose

The included `Dockerfile` is a multi-stage Alpine build. The
`docker-compose.yml` defines a single service with one named volume
(`telgrarr-data` → `/data`) and one user-defined network (`telgrarr-net`):

```bash
docker compose up -d --build
docker compose logs -f telgrarr
```

The container runs as a non-root user (UID/GID 1000), drops all Linux
capabilities, and sets `no-new-privileges`. A built-in `HEALTHCHECK` polls the lightweight `/health/live` endpoint
every 30 seconds. It always returns 200 once the process is up,
regardless of configuration state, so a normal first-run (pre-setup)
container is never marked unhealthy. The deeper `/health` endpoint
additionally reports readiness (missing credentials, degraded providers)
for operator or monitoring use; the container health check does not poll
it.

## Reverse Proxy + TLS

Telgrarr serves plain HTTP. Put it behind a reverse proxy for TLS
termination. Cloudflare Tunnel, Caddy, nginx, and Traefik all work.
Two requirements:

1. Set `TRUST_PROXY=true` in `.env` so Express honors `X-Forwarded-*`
   headers (needed for correct IP attribution in login throttling).
2. Ensure the proxy forwards `X-Forwarded-Proto` so `COOKIE_SECURE=auto`
   correctly flags the session cookie as `Secure` over HTTPS.

**Caddy:**

```caddy
telgrarr.example.com {
    reverse_proxy localhost:3400
}
```

**Cloudflare Tunnel:** point the public hostname at
`http://localhost:3400`. Cloudflare terminates TLS; Telgrarr sees plain
HTTP with `X-Forwarded-Proto: https`.

## Operational Notes

- **Backups:** enabled by default, runs every 7 days, retains the last 5
  archives under `<BACKUP_DIR>` (default `<project>/backups/`). In a Docker
  deployment, mount that path explicitly if you need offsite copies. The
  manifest covers config, templates, auth, blacklist, history, the pending
  media queue, the event ring buffer, and the version ledger. Your live
  login session is deliberately NOT included; restoring a backup never
  clobbers an active session on the machine you restore to. The
  regenerable media cache, the transient sweep-state marker, the
  reconciliation cursor (which safely re-seeds itself), and the ephemeral
  password-reset token are excluded.

- **Migrating to a new host:** on the old instance open **Settings →
  Backup & Restore**, click **Create Now**, then **Download** the archive.
  On the new instance, install Telgrarr and create the admin account, then
  under **Settings → Backup & Restore** use **Import Backup File** to
  upload the `.zip` and click **Restore**. `DATA_DIR` and any environment
  overrides (port, host, proxy settings) are deployment-specific and set
  fresh on the new host.

- **Logs:** `<LOGS_DIR>` (default `<project>/logs/`) contains `app.log`,
  `error.log`, and `audit.log` with automatic size-based rotation.

- **Recovery:** `npm run recover` generates a single-use, 15-minute
  password-reset token written to `recovery.json` under `DATA_DIR`. Enter
  it in the GUI **Forgot Password** dialog; the token is burned on first
  use. Automatic crash and queue recovery is separate and runs on boot.

- **Single-instance:** a file lock on `<DATA_DIR>/.telgrarr.lock` prevents
  two processes from sharing one data directory. A second instance fails
  fast on boot.

- **Version bumps:** `node release-manager.js <patch|minor|major|beta-bump>`
  bumps `package.json` and appends to the version ledger atomically.
  Restart through your process manager to load the new version.
- **Burst handling:** a large webhook burst (e.g. ~400 imports arriving in one
  sweep window) dispatches strictly serially at `telegram.delayMs` (default 6s)
  — roughly 40 minutes for 400 items. A `SWEEP_LONG_RUNNING` log during a burst
  sweep is an expected watchdog notice, not a fault. Queue overflow (oldest
  items dropped first) only begins once more than `queue.maxItems` (default
  1000, adjustable 100–5000) items are pending at once. Tunable operator
  levers: `queue.maxItems`, `batchWindowMs`, and `telegram.delayMs` (all in
  Settings) — `telegram.delayMs` is floor-clamped on boot so it can never
  regress to an unsafe pacing value.

## Development

```bash
# Backend in one terminal
npm start

# Vite dev server in another (HMR + /api proxy)
cd gui
DEV_PROXY_TARGET=http://localhost:3400 npm run dev
```

The Vite dev server listens on port 5173 and proxies `/api/*` to the
backend. Set `DEV_ALLOWED_HOSTS` (comma-separated) if you need to access
the dev server from a non-localhost host.

**Tests:**

```bash
npm run test:run          # vitest — full unit suite
npm run test:e2e          # Playwright end-to-end smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for code conventions and PR
guidance.

## Project Structure

```
src/                Backend
  auth/             Credentials, rate-limit, session cookie, stream ticket, webhook token
  routes/           Express route modules (one per resource)
  services/         Orchestration (connection tester, enricher, notifications, reconciler)
  settings/         Schema-driven validation, serializer, policy, secrets
  middlewares/      Auth guard, request logger
  templates/        Caption layouts, caption strings, layout schema
  utils/            Shared utilities (retry, SPA fallback)
gui/                React frontend (Vite + Tailwind + Zustand)
shared/             Cross-cutting contracts (event names)
scripts/            Operator utilities (recovery token generator)
tests/              vitest unit tests + Playwright e2e
data/               Persistent runtime state (git-ignored)
logs/               Application logs (git-ignored)
backups/            Backup archives (git-ignored)
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for
setup, conventions, and pull-request guidance.

## License

[MIT](LICENSE) © 2026 Fahad-Beta

## Security

Report vulnerabilities through GitHub's private security advisory system,
not public issues. See [SECURITY.md](SECURITY.md).

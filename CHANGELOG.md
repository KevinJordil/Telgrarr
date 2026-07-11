# Changelog

All notable changes to Telgrarr will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.1] - 2026-07-11
First public release. `0.1.0` below was an internal development milestone only: it was never tagged or published, and this is the true first release.

### Added
- Multi-language captions: 6 target languages (Arabic, English, Spanish,
  French, German, Portuguese), each with correct RTL handling, translated
  status/labels, and a per-language machine-translation watermark
- Visual layout composer ("Default styling"): reorder, toggle, and relabel
  caption elements from the GUI, with a live preview that updates as you edit
- Movie plot enrichment for Radarr (TMDb -> OMDb -> own fallback chain),
  toggleable, with an AI-only mode and an adjustable summary length
- Independent enable/disable toggles per translation provider (AI, DeepL,
  Google); official Google Translate API path with a keyless fallback
- History page: searchable, filterable, paginated log of everything sent,
  with poster/compact/table views, per-entry detail (ratings, artwork,
  episode info), and configurable retention (max items / max age)
- First-run setup wizard in the GUI: create the first admin account with
  no terminal required
- Webhook secret auto-generated on first boot; regenerate anytime from the
  Settings GUI
- Backup import/export via the GUI: upload, download, restore, or delete
  backups entirely from Settings
- `/health/live` liveness endpoint: a lightweight, always-200 probe for
  container/orchestrator health checks, independent of configuration state
- `RESTART_CAPABLE` deployment flag: an explicit signal (pre-set in the
  Docker/PM2 templates) that safely enables self-restart after a settings
  change that requires one
- Four selectable GUI themes (dark / light / neon / Telegram-native)
- Jellyfin documented as a supported library-refresh target alongside Emby

### Changed
- `media_queue.json` now lives under `DATA_DIR` (previously the project
  root); a one-time automatic migration moves it on first boot after
  upgrade; no operator action needed, and nothing is ever deleted
- Queue capacity is now bounded with oldest-item eviction, and Telegram
  dispatch enforces a pacing floor, protecting against overload during
  large notification bursts
- TMDb/OMDb failures now short-circuit for the rest of a sweep once an
  auth, rate-limit, or quota error is seen, instead of retrying every item
- Translator tiers back off individually after a rate-limit or quota
  response and escalate to the next provider rather than retrying the
  same one
- Metadata fetches run with bounded concurrency; Telegram dispatch remains
  strictly sequential
- Settings page reorganized into grouped sections (Services / Notifications
  / Metadata / Processing / System)
- Full accessibility pass across the GUI: keyboard focus rings, ARIA
  roles/labels, and reduced-motion support throughout

### Fixed
- Queue lock contention under a large simultaneous webhook burst could
  silently drop notifications (Sonarr/Radarr do not retry failed
  deliveries); fixed by having this process serialize its own queue
  access ahead of the file lock
- A corrupted queue snapshot could halt processing; it is now quarantined
  and reset automatically
- Sweep crashes are now recovered without losing in-flight items or
  duplicating already-dispatched ones
- `/health` reported an unconditionally unhealthy container on a normal,
  unconfigured first-run instance; split into a liveness check (always
  200) and a separate deep readiness check (503 with the specific
  missing-credential list)

### Security
- All secret-bearing files (auth credentials, backups, logs) now write
  with explicit `0600` permissions
- The webhook secret can only be changed via its dedicated regenerate
  endpoint; submitting it through the general settings save is rejected
- Backups no longer include live session tokens or the one-time
  password-recovery token
- Backup restore validates every archived file as parseable JSON before
  touching anything on disk, and only extracts filenames it manifested
  itself (no zip-slip)
- Login no longer returns a raw session token in the response body; the
  httpOnly cookie is the only credential

### Documentation
- README overhaul: Jellyfin support, all 6 languages, import/upgrade
  behavior, and a new resilience section
- Docker/Compose quick-start documents the liveness vs. readiness
  distinction
## 0.1.0 - 2026-06-04
_Internal development milestone; not tagged or publicly released. See
1.0.0-beta.1 above for the first public version._


Initial public release. Telgrarr is a webhook-driven notification bridge
between Sonarr / Radarr and Telegram, with optional Emby library refresh
and multi-tier translation for Arabic captions.

### Added

- Portable env-driven configuration (`DATA_DIR`, `PORT`, `HOST`,
  `CORS_ORIGIN`, `TRUST_PROXY`, `WEBHOOK_SECRET`, `COOKIE_SECURE`) with
  `.env` file support
- Multi-stage Docker image and compose stack with a single persistent
  volume (`telgrarr-data` -> `/data`) and a named user-defined network
- `.nvmrc` and `engines: node >=22.0.0` for prerequisite enforcement
- Single-instance file lock — a second process against the same data
  directory refuses to boot rather than corrupting state
- Stream tickets for the SSE event feed (single-use, short-lived;
  replaces the previous token-in-URL pattern)
- HttpOnly session cookies with `SameSite=Lax` and configurable `Secure`
  semantics (`COOKIE_SECURE=auto` follows TLS at the reverse proxy)
- Per-(IP, username) progressive login backoff that never hard-locks
  legitimate operators behind a shared-IP proxy
- Webhook authentication via a path-segment secret
  (`/hooks/<secret>/sonarr|radarr`); endpoints are closed (HTTP 401) by
  default when `WEBHOOK_SECRET` is unset
- 75-test vitest suite (validator, serializer, policy, connection tester,
  queue, credentials, rate-limit, webhook token, stream ticket, session
  cookie, smoke) and a Playwright end-to-end smoke
- `release-manager.js` with semver validation, atomic writes, a
  process-manager-agnostic restart prompt, and `--help`

### Changed

- Password hashing migrated from PBKDF2 to scrypt with transparent legacy
  upgrade on first successful login
- Version single-source-of-truth moved from `data/system-release.json`
  to `package.json`; the ledger now stores tier, build timestamp, and
  history only
- Queue read errors now surface to the caller instead of silently
  returning an empty queue
- Cross-cutting event contract relocated to root-level
  `shared/events.json` (single source for both backend and GUI)
- Default startup is `npm start` (`node src/index.js`); PM2, systemd,
  and Docker are documented but optional

### Security

- All password hashing routed through a single auditable credentials
  module (`src/auth/credentials.js`)
- Constant-time login comparison; the verify path runs even for unknown
  usernames to prevent timing-based account enumeration
- Webhook endpoints rejected with HTTP 401 when `WEBHOOK_SECRET` is
  unset (operator must explicitly opt in)
- CORS deny-by-default; same-origin GUI requires no header. Cross-origin
  GUIs set `CORS_ORIGIN` to exactly one origin
- Secret values redacted from request logs (URL query strings + known
  secret field names)
- Docker container runs as a non-root user, drops all Linux
  capabilities, and sets `no-new-privileges`
- `.bak.*` files and runtime state directories excluded from
  `.gitignore` and the Docker build context

### Fixed

- Library refresh no longer logs an error when Emby is unconfigured —
  the call returns cleanly instead of attempting an empty-URL request
- `release-manager.js` and `about.routes.js` now honor `DATA_DIR` for
  the ledger path (previously hardcoded to `<project-root>/data/`)

[Unreleased]: https://github.com/Fahad-Beta/telgrarr/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: https://github.com/Fahad-Beta/telgrarr/releases/tag/v1.0.0-beta.1

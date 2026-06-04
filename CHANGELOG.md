# Changelog

All notable changes to Telgrarr will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-04

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

[Unreleased]: https://github.com/Fahad-Beta/telgrarr/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Fahad-Beta/telgrarr/releases/tag/v0.1.0

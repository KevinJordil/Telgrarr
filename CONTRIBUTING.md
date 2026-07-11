# Contributing to Telgrarr

Thanks for your interest in contributing. This document covers how to set
up a development environment, run the test suite, and submit changes.

## Development Setup

Requirements: Node.js 22 or newer. An `.nvmrc` is included — `nvm use`
will select the right version.

~~~bash
git clone https://github.com/Fahad-Beta/telgrarr.git
cd telgrarr
nvm use                            # or install Node 22+ manually
npm install
cd gui && npm install && cd ..
cp .env.example .env
node setup-auth.js                 # interactive first-run auth bootstrap
~~~

For day-to-day work, run the backend and the Vite dev server separately:

~~~bash
# terminal 1
npm start                          # backend on :3400

# terminal 2
cd gui && npm run dev              # GUI dev server on :5173, proxies /api -> :3400
~~~

Set `DEV_ALLOWED_HOSTS` (comma-separated) if you need to access the dev
server from a non-localhost host, and `DEV_PROXY_TARGET` if the backend
isn't on `localhost:3400`.

## Tests

Telgrarr ships with a vitest suite and Playwright end-to-end smoke tests.

~~~bash
npm run test:run                   # full vitest run (must stay green)
npm run test:e2e                   # Playwright e2e
~~~

**All pull requests must keep the full vitest suite green.** The suite is
large and growing (`npx vitest run` prints the current suite/test counts);
new functionality should add coverage where it materially reduces
regression risk. Tests live under `tests/`.

## Code Conventions

Telgrarr follows a small set of conventions consistently:

- **Atomic writes**: any persistent JSON file is written via
  `write-file-atomic`, never `fs.writeFileSync`.
- **Lockfile-guarded mutations**: shared mutable state (queue, blacklist,
  history) is protected by `proper-lockfile`.
- **Structured logging**: `log.LEVEL('ModuleNoun', 'Action -> Outcome -> Context')`
  — module nouns are atomic (`'Sweeper'`, `'Auth'`, `'Backup'`), the
  message is arrow-separated with success/failure as the second segment.
  Domain modules log on failure only; mutations log on success.
- **No silent failures**: every async I/O has a try/catch; domain handlers
  throw on failure rather than returning null. Enrichment fetchers
  (`src/tmdb.js`, `src/omdb.js`) are the documented exception — they
  return null and the caller falls back.
- **Schema-driven validation**: settings shape, bounds, and rules live in
  `src/settings-schema.js`; validators read from there. Do not duplicate
  validation logic.
- **Env precedence**: `process.env > .env > data/config.json > defaults`.
  The `.env` loader (`src/load-env.js`) never overrides a variable the
  process manager already set.
- **Single-instance assumption**: state is in-process; the lockfile at
  `<DATA_DIR>/.telgrarr.lock` prevents a second process from sharing one
  data directory. New features should not silently break this contract.
- **GUI state through Zustand stores only**: no raw `fetch` state in
  components.

## Pull Requests

- One concern per PR. A change that touches authentication AND a template
  rendering bug should be two PRs.
- Include a description of what changed and why. Link any related issue.
- Reference the affected behavior — `auth: constant-time compare on
  legacy pbkdf2 verify` beats `tweak auth.routes.js`.
- Keep the diff scoped to the files the change requires; don't reformat
  unrelated files in the same PR.
- Run `npm run test:run` locally before pushing.

## Commit Messages

Short, imperative, descriptive:

~~~
auth: constant-time compare on legacy pbkdf2 verify
queue: throw on read error instead of returning empty
docs: clarify TRUST_PROXY semantics in .env.example
~~~

## Reporting Bugs

Use [GitHub Issues](https://github.com/Fahad-Beta/telgrarr/issues). Include:

- Telgrarr version (`GET /about` or `node -e "console.log(require('./package.json').version)"`)
- Node version (`node --version`)
- Process manager (PM2, systemd, Docker, bare)
- Reverse proxy (Cloudflare tunnel, Caddy, nginx, none)
- Steps to reproduce
- Relevant log excerpts from `logs/error.log`

## Security Issues

Do **not** open a public issue for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for the disclosure process.

'use strict';

// Zero-dep .env loader (RD-1). Populates process.env from <project-root>/.env at
// the very top of boot, BEFORE config.js is required. Runs too early for the L5
// logger to exist, so it stays silent (bootstrap exception). No .env => no-op.
// Never overrides an already-set variable: real env (PM2/systemd/Docker) wins,
// keeping precedence env > .env > config.json > defaults.

const fs = require('fs');
const path = require('path');

function loadEnv(envPath = path.join(__dirname, '..', '.env')) {
  let raw;
  try {
    raw = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;   // no .env present => no-op (parity)
    throw err;                           // real I/O error => fail fast (R10)
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;  // never override
    let val = trimmed.slice(eq + 1).trim();
    if (val.length >= 2 &&
        ((val[0] === '"' && val[val.length - 1] === '"') ||
         (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

module.exports = loadEnv;

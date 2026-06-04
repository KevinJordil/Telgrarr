'use strict';
/**
 * release-manager.js — bump the Telgrarr version.
 *
 * SSoT is package.json (RD-7). data/system-release.json is the build/history
 * ledger only (no version field on the ledger). Both files are written
 * atomically (R09). Restarting the running process is the operator's job
 * (PM2, systemd, docker compose, …); this script never reloads anything.
 *
 * Usage:   node release-manager.js <patch|minor|major|beta-bump>
 *          node release-manager.js --help
 *
 * Refs: E.3 / E.4, RD-7, R09. Closes M6 + D4.
 */
require('./src/load-env')();   // RD-1: honor .env for DATA_DIR (no .env => no-op)
const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, 'data');   // D-A: CLI mirrors setup-auth.js (Master §3)
const PKG_PATH    = path.join(__dirname, 'package.json');
const LEDGER_PATH = path.join(DATA_DIR, 'system-release.json');
const VALID_TYPES = ['patch', 'minor', 'major', 'beta-bump'];
const SEMVER_RE   = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;

function fail(msg) {
  console.error(`❌  ${msg}`);
  process.exit(1);
}

function usage() {
  return `Usage: node release-manager.js <${VALID_TYPES.join('|')}>`;
}

// ── CLI parse ─────────────────────────────────────────────────────────────
const releaseType = process.argv[2];
if (releaseType === '-h' || releaseType === '--help') {
  console.log(usage());
  process.exit(0);
}
if (!releaseType) {
  fail(`Missing release type.\n${usage()}`);
}
if (!VALID_TYPES.includes(releaseType)) {
  fail(`Invalid release type: ${releaseType}\n${usage()}`);
}

// ── Load SSoT + ledger ────────────────────────────────────────────────────
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`Failed to read ${label} (${file}): ${err.message}`);
  }
}

const pkg    = readJson(PKG_PATH,    'package.json');
const ledger = readJson(LEDGER_PATH, 'system-release ledger');
if (!Array.isArray(ledger.history)) ledger.history = [];

// ── Parse current version (SSoT) ──────────────────────────────────────────
const currentVersion = pkg.version;
const m = SEMVER_RE.exec(currentVersion || '');
if (!m) {
  fail(`package.json version "${currentVersion}" is not a recognized semver (expected X.Y.Z or X.Y.Z-beta.N)`);
}

let major   = Number(m[1]);
let minor   = Number(m[2]);
let patch   = Number(m[3]);
let betaNum = m[4] !== undefined ? Number(m[4]) : 0;
const hadBeta = m[4] !== undefined;

// ── Compute next version ──────────────────────────────────────────────────
switch (releaseType) {
  case 'major':     major++; minor = 0; patch = 0; betaNum = 0; break;
  case 'minor':     minor++; patch = 0; betaNum = 0;            break;
  case 'patch':     patch++; betaNum = 0;                       break;
  case 'beta-bump':
    if (!hadBeta) { patch++; betaNum = 1; } else { betaNum++; }
    break;
}

let newVersion = `${major}.${minor}.${patch}`;
if (betaNum > 0) newVersion += `-beta.${betaNum}`;

const timestamp = new Date().toISOString();
const tier      = betaNum > 0 ? 'beta' : 'production';

// ── Ledger: append history, drop legacy version key, set tier+timestamp ──
ledger.history.push({
  version:   currentVersion,
  timestamp: ledger.buildTimestamp || timestamp
});
delete ledger.version;          // RD-7: ledger no longer carries the SSoT
ledger.tier           = tier;
ledger.buildTimestamp = timestamp;

// ── Atomic writes (R09): SSoT then ledger ─────────────────────────────────
pkg.version = newVersion;
try {
  writeFileAtomic.sync(PKG_PATH,    JSON.stringify(pkg,    null, 2) + '\n');
  writeFileAtomic.sync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
} catch (err) {
  fail(`Atomic write failed: ${err.message}`);
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\n✅  SYSTEM RELEASE MANAGER`);
console.log(`─────────────────────────────`);
console.log(`Old Version : ${currentVersion}`);
console.log(`New Version : ${newVersion}`);
console.log(`Tier        : ${tier}`);
console.log(`Timestamp   : ${timestamp}`);
console.log(`─────────────────────────────`);
console.log(`📦 Atomically updated: package.json (SSoT) + data/system-release.json (ledger)`);
console.log(`🔄 Restart Telgrarr via your process manager to load v${newVersion}.`);

'use strict';

const fs       = require('fs');
const path     = require('path');
const lockfile = require('proper-lockfile');
const log      = require('./logger');
const config   = require('./config');

const BLACKLIST_FILE = path.join(config.DATA_DIR, 'blacklist.json');

const EMPTY = () => ({
  sonarr: { ids: [], paths: [] },
  radarr: { ids: [], paths: [] },
});

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = EMPTY();

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFromDisk() {
  try {
    if (fs.existsSync(BLACKLIST_FILE)) {
      return JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
    }
  } catch (err) {
    log.error('Blacklist', `Failed to read blacklist.json: ${err.message}`);
  }
  return EMPTY();
}

async function writeToDisk(data) {
  let release;
  try {
    // proper-lockfile requires the target to exist; create it ONCE if missing.
    // Do NOT append the payload here — appending to existing content yields
    // invalid JSON if the lock below fails or the process dies before the
    // truncating write, silently emptying the blacklist on the next read.
    if (!fs.existsSync(BLACKLIST_FILE)) fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(EMPTY(), null, 2));
    release = await lockfile.lock(BLACKLIST_FILE, { retries: { retries: 5, minTimeout: 50 } });
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2), 'utf8');
  } finally {
    if (release) await release();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function load() {
  cache = readFromDisk();
  const idCount   = (cache.sonarr.ids.length + cache.radarr.ids.length);
  const pathCount = (cache.sonarr.paths.length + cache.radarr.paths.length);
  log.info('Blacklist', `Loaded — ${idCount} title(s), ${pathCount} path rule(s)`);
}

function isIdBlacklisted(type, id) {
  return (cache[type]?.ids || []).includes(Number(id));
}

function isPathBlacklisted(type, seriesPath) {
  if (!seriesPath) return false;
  return (cache[type]?.paths || []).some(p => seriesPath.startsWith(p));
}

function getAll() {
  return {
    sonarr: { ids: [...cache.sonarr.ids], paths: [...cache.sonarr.paths] },
    radarr: { ids: [...cache.radarr.ids], paths: [...cache.radarr.paths] },
  };
}

async function addId(type, id) {
  const data = readFromDisk();
  const numId = Number(id);
  if (!data[type].ids.includes(numId)) {
    data[type].ids.push(numId);
    await writeToDisk(data);
    cache = data;
    log.info('Blacklist', `Added ${type} id:${numId}`);
  }
}

async function removeId(type, id) {
  const data = readFromDisk();
  const numId = Number(id);
  data[type].ids = data[type].ids.filter(i => i !== numId);
  await writeToDisk(data);
  cache = data;
  log.info('Blacklist', `Removed ${type} id:${numId}`);
}

async function addPath(type, p) {
  const data = readFromDisk();
  const trimmed = p.trim();
  if (!data[type].paths.includes(trimmed)) {
    data[type].paths.push(trimmed);
    await writeToDisk(data);
    cache = data;
    log.info('Blacklist', `Added ${type} path: ${trimmed}`);
  }
}

async function removePath(type, p) {
  const data = readFromDisk();
  const trimmed = p.trim();
  data[type].paths = data[type].paths.filter(i => i !== trimmed);
  await writeToDisk(data);
  cache = data;
  log.info('Blacklist', `Removed ${type} path: ${trimmed}`);
}

module.exports = { load, isIdBlacklisted, isPathBlacklisted, getAll, addId, removeId, addPath, removePath };

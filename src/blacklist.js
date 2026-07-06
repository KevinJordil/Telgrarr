'use strict';

const fs       = require('fs');
const path     = require('path');
const lockfile = require('proper-lockfile');
const writeAtomic = require('write-file-atomic');
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
// FA-26(ii): normalize a parsed-but-possibly-malformed on-disk shape onto
// the EMPTY() skeleton, per-source / per-array. A hand-edited or corrupt-
// but-parseable file (e.g. {} or []) must load EMPTY + logged, never
// TypeError the boot IIFE (or any of the CRUD ops below, which share this
// same read path). wasMalformed is true if ANY of the four expected arrays
// was missing or wrong-typed, even if the others were valid.
function normalizeShape(raw) {
  const sonarrIds   = Array.isArray(raw?.sonarr?.ids)   ? raw.sonarr.ids   : [];
  const sonarrPaths = Array.isArray(raw?.sonarr?.paths) ? raw.sonarr.paths : [];
  const radarrIds   = Array.isArray(raw?.radarr?.ids)   ? raw.radarr.ids   : [];
  const radarrPaths = Array.isArray(raw?.radarr?.paths) ? raw.radarr.paths : [];
  const wasMalformed = !(
    Array.isArray(raw?.sonarr?.ids) && Array.isArray(raw?.sonarr?.paths) &&
    Array.isArray(raw?.radarr?.ids) && Array.isArray(raw?.radarr?.paths)
  );
  return {
    data: {
      sonarr: { ids: sonarrIds, paths: sonarrPaths },
      radarr: { ids: radarrIds, paths: radarrPaths },
    },
    wasMalformed,
  };
}

function readFromDisk() {
  try {
    if (fs.existsSync(BLACKLIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
      const { data, wasMalformed } = normalizeShape(raw);
      if (wasMalformed) {
        log.error('Blacklist', 'Read → Malformed shape → EMPTY skeleton loaded');
      }
      return data;
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
    writeAtomic.sync(BLACKLIST_FILE, JSON.stringify(data, null, 2)); // R09: atomic write inside the lock (FA-26i)
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

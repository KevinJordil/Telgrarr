'use strict';
const fs    = require('fs');
const path  = require('path');
const lock  = require('proper-lockfile');
const write = require('write-file-atomic');
const config = require('./config');
const log    = require('./logger');

const CACHE_FILE = path.join(config.DATA_DIR, 'media-cache.json');

function ensureCacheFile() {
  if (!fs.existsSync(CACHE_FILE)) {
    fs.writeFileSync(CACHE_FILE, '{}', 'utf8');
  }
}

let _cache    = null;
let _loadedAt = 0;

async function loadCache() {
  const now = Date.now();
  if (_cache && now - _loadedAt < 5000) return _cache;
  try {
    ensureCacheFile();
    const raw = await fs.promises.readFile(CACHE_FILE, 'utf8');
    _cache    = JSON.parse(raw);
    _loadedAt = now;
    return _cache;
  } catch (err) {
    log.error('MediaCache', `Cache Load → Error → ${err.message}`);
    _cache    = {};
    _loadedAt = now;
    return _cache;
  }
}

async function saveCache(data) {
  try {
    ensureCacheFile();
    const release = await lock.lock(CACHE_FILE, { retries: 5, stale: 10000 });
    try {
      await write(CACHE_FILE, JSON.stringify(data, null, 2) + '\n');
      _cache = data;
    } finally {
      await release();
    }
  } catch (err) {
    log.error('MediaCache', `Cache Save → Error → ${err.message}`);
  }
}

function isExpired(entry) {
  if (!entry?.cachedAt) return true;
  const ttlMs = config.mediaCache.ttlDays * 86400000;
  return Date.now() - new Date(entry.cachedAt).getTime() > ttlMs;
}

async function get(key) {
  try {
    const data  = await loadCache();
    const entry = data[key];
    if (!entry || isExpired(entry)) {
      log.info('MediaCache', `Cache → Miss → [${key}]`);
      return null;
    }
    log.info('MediaCache', `Cache → Hit → [${key}]`);
    return entry.data;
  } catch (err) {
    log.error('MediaCache', `Cache Read → Error → [${key}] | ${err.message}`);
    return null;
  }
}

async function set(key, data) {
  try {
    const cacheData = await loadCache();
    cacheData[key]  = { data, cachedAt: new Date().toISOString() };

    const maxEntries = config.mediaCache?.maxEntries ?? 500;
    const keys = Object.keys(cacheData);
    if (keys.length > maxEntries) {
      const oldest = keys.reduce((a, b) =>
        new Date(cacheData[a].cachedAt) < new Date(cacheData[b].cachedAt) ? a : b
      );
      delete cacheData[oldest];
    }

    await saveCache(cacheData);
    log.info('MediaCache', `Cache Write → Success → [${key}]`);
  } catch (err) {
    log.error('MediaCache', `Cache Write → Error → [${key}] | ${err.message}`);
  }
}

module.exports = { get, set };

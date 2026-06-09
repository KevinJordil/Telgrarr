import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Sandbox DATA_DIR BEFORE requiring config / media-cache. media-cache captures
// CACHE_FILE = path.join(config.DATA_DIR, 'media-cache.json') at module load.
const tmpDataDir = path.join(
  os.tmpdir(),
  `telgrarr-mc-test-${process.pid}-${Date.now()}`
);
fs.mkdirSync(tmpDataDir, { recursive: true });
process.env.DATA_DIR = tmpDataDir;

const config = require('../src/config.js');
let cache; // re-required per-test to reset _cache/_loadedAt/_loadInFlight

const cacheFile = path.join(tmpDataDir, 'media-cache.json');

function cleanupCacheFile() {
  try { fs.unlinkSync(cacheFile); } catch (_) {}
  try { fs.rmSync(`${cacheFile}.lock`, { recursive: true, force: true }); } catch (_) {}
}

beforeEach(() => {
  cleanupCacheFile();
  // Force-reload media-cache so its module-level state resets between tests
  // (the 5s in-memory cache would otherwise leak state across tests).
  delete require.cache[require.resolve('../src/media-cache.js')];
  cache = require('../src/media-cache.js');
  // Reset mutable config knobs to clean defaults so tests are order-independent.
  config.mediaCache.maxEntries = 500;
  config.mediaCache.ttlDays    = 30;
});

afterAll(() => {
  cleanupCacheFile();
  try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch (_) {}
});

describe('MediaCache contract (C7 / C18 — golden master)', () => {
  it('C7-load: concurrent cold set() preserves both writes (no in-flight load race)', async () => {
    await Promise.all([
      cache.set('A', { v: 1 }),
      cache.set('B', { v: 2 }),
    ]);
    expect(await cache.get('A')).toEqual({ v: 1 });
    expect(await cache.get('B')).toEqual({ v: 2 });
  });

  it('C7-eviction: full overflow drains in a single set() call after maxEntries reduction', async () => {
    config.mediaCache.maxEntries = 10;
    for (let i = 0; i < 10; i++) {
      await cache.set(`key${i}`, { i });
      await new Promise((r) => setTimeout(r, 5)); // distinct cachedAt
    }
    config.mediaCache.maxEntries = 3;
    await cache.set('newest', { i: 99 });

    // Oldest 8 must be evicted; the 3 newest must remain.
    expect(await cache.get('key0')).toBeNull();
    expect(await cache.get('key1')).toBeNull();
    expect(await cache.get('key7')).toBeNull();
    expect(await cache.get('key8')).toEqual({ i: 8 });
    expect(await cache.get('key9')).toEqual({ i: 9 });
    expect(await cache.get('newest')).toEqual({ i: 99 });
  });

  it('C18: null-prototype backing blocks prototype-chain lookups', async () => {
    await cache.set('__proto__', { polluted: true });
    // 'toString' lives on Object.prototype. On a plain-object backing the
    // lookup would resolve via the chain; null-proto severs that path.
    expect(await cache.get('toString')).toBeNull();
  });

  it('TTL expiry: entries past ttlDays return Miss', async () => {
    config.mediaCache.ttlDays = 0; // any non-zero elapsed time => expired
    await cache.set('X', { v: 'foo' });
    await new Promise((r) => setTimeout(r, 5));
    expect(await cache.get('X')).toBeNull();
  });

  it('get returns null for unknown key', async () => {
    expect(await cache.get('does-not-exist')).toBeNull();
  });
});

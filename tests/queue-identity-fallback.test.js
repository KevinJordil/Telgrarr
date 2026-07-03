import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-q-identity-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const logCalls = [];
stub('../src/logger.js', { info: (...a) => logCalls.push(['info', ...a]), warn: () => {}, error: () => {}, audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: () => {}, emitThrottled: () => {} });
const queue = require('../src/queue.js');
const { identityKey } = queue;
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(config.queueFile + '.lock', { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  logCalls.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('Queue identity fallback (BCS P2 / F7, FLAG C)', () => {
  it('existing key shapes are byte-identical (parity)', () => {
    expect(identityKey({ source: 'sonarr', seriesId: 1, episodeId: 9 })).toBe('sonarr:1:eid:9');
    expect(identityKey({ source: 'sonarr', seriesId: 1, seasonNumber: 2, episodeNumber: 3 })).toBe('sonarr:1:s2e3');
    expect(identityKey({ source: 'radarr', movieId: 5 })).toBe('radarr:5');
    expect(identityKey(null)).toBe(null);
    expect(identityKey('x')).toBe(null);
    expect(identityKey({ source: 'other' })).toBe(null);
    expect(identityKey({ source: 'sonarr' })).toBe(null); // no seriesId
  });
  it('null-key-era sonarr items now get a stable sha1 fingerprint key', () => {
    const a = { source: 'sonarr', seriesId: 7, episodeTitle: 'Pilot', quality: '1080p' };
    const k = identityKey(a);
    expect(k).toMatch(/^sonarr:7:fp:[0-9a-f]{40}$/);
    const b = { ...a, _receivedAt: 999999, traceId: 'zzz' };
    expect(identityKey(b)).toBe(k); // volatile fields excluded
    const c = { ...a, quality: '720p' };
    expect(identityKey(c)).not.toBe(k); // distinct content => distinct key
    expect(identityKey({ source: 'sonarr', seriesId: 7 })).toBe(identityKey({ source: 'sonarr', seriesId: 7 }));
    expect(identityKey({ source: 'sonarr', seriesId: 7 })).toMatch(/^sonarr:7:fp:/);
  });
  it('enqueue-level: identical malformed payloads dedupe; distinct ones do not', async () => {
    const a = { source: 'sonarr', seriesId: 7, episodeTitle: 'Pilot', quality: '1080p', traceId: 't1' };
    const b = { source: 'sonarr', seriesId: 7, episodeTitle: 'Pilot', quality: '1080p', traceId: 't2', _receivedAt: 42 };
    const c = { source: 'sonarr', seriesId: 7, episodeTitle: 'Finale', quality: '1080p', traceId: 't3' };
    expect(await queue.enqueue(a)).toBe(true);
    expect(await queue.enqueue(b)).toBe(false); // coalesced
    expect(await queue.enqueue(c)).toBe(true);
    const disk = JSON.parse(fs.readFileSync(config.queueFile, 'utf8'));
    expect(disk.length).toBe(2);
    const skip = logCalls.find(l => typeof l[2] === 'string' && l[2].includes('Skipped (duplicate)') && l[2].includes(':fp:'));
    expect(skip).toBeTruthy();
  });
});

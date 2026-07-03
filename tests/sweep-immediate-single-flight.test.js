import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-single-flight-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 80;
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const logCalls = [];
let dispatchCount = 0;
stub('../src/logger.js', { info: (...a) => logCalls.push(['info', ...a]), warn: (...a) => logCalls.push(['warn', ...a]), error: (...a) => logCalls.push(['error', ...a]), audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: () => {}, emitThrottled: () => {} });
stub('../src/reconcile-state.js', { recordSent: () => {} });
stub('../src/formatter.js', { buildCaption: async () => 'cap', getPosterUrl: () => 'http://p' });
stub('../src/radarr-formatter.js', { buildMovieCaption: () => ({ caption: 'cap', pass: 1, length: 0 }), getPosterUrl: () => 'http://p' });
stub('../src/emby.js', { refreshLibrary: async () => false });
stub('../src/history.js', { addHistory: async () => {}, pruneByAge: async () => 0 });
stub('../src/services/media-enricher.js', { enrichSonarrMedia: async (s) => s, enrichRadarrMedia: async (m, t) => ({ movie: m, tmdbMovie: t, ratings: {} }) });
stub('../src/utils/media-utils.js', { resolveRating: () => null });
stub('../src/services/metadata.js', {
  fetchSonarrMetadata: async () => ({ series: { title: 'T', year: 2020, imdbId: null, tmdbId: null, tvdbId: null }, tmdbSeries: { episode_run_time: [] }, omdbData: null }),
  fetchRadarrMetadata: async () => ({ movie: { title: 'M', year: 2020, imdbId: null, tmdbId: null }, tmdbMovie: null, omdbData: null }),
});
stub('../src/services/provider-breaker.js', { reset: () => {}, resetCycle: () => {} });
stub('../src/templates.js', { getActiveMode: () => 'default_en', isElementEnabled: () => false });
stub('../src/services/notifications.js', { dispatchBatch: async (msgs, items) => { dispatchCount++; return { successful: items, failed: [] }; } });
stub('../src/translator-cooldown.js', { resetCycle: () => {}, getCooldownUntil: () => null });
const queue   = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(config.queueFile + '.lock', { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  logCalls.length = 0;
  dispatchCount = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
const son = (id) => ({ source: 'sonarr', traceId: `t${id}`, seriesId: 1, episodeId: id, seasonNumber: 1, episodeNumber: id });
async function waitFor(pred, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('waitFor timeout');
}
describe('Sweep immediate single-flight (BCS P1 / F8)', () => {
  it('25 same-tick scheduleSweep at depth>=50: exactly ONE dispatch, zero guard rejections', { timeout: 20000 }, async () => {
    await queue.enqueueMany(Array.from({ length: 50 }, (_, i) => son(i + 1)));
    const calls = [];
    for (let i = 0; i < 25; i++) calls.push(sweeper.scheduleSweep());
    await Promise.all(calls);
    await waitFor(() => dispatchCount > 0);
    await waitFor(() => !sweeper.getQueueState().isSweeping);
    expect(dispatchCount).toBe(1);                       // exactly one runSweep dispatched
    const rejections = logCalls.filter(c => typeof c[2] === 'string' && c[2].includes('Rejected'));
    expect(rejections.length).toBe(0);                   // no guard-rejection races
    expect(await queue.peekLength()).toBe(0);            // fully drained
    await new Promise(r => setTimeout(r, 300));          // drain any belt-and-braces rearm timer (empty sweep, no dispatch)
    expect(dispatchCount).toBe(1);
  });
});

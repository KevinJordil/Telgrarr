import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-timer-catch-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 50;
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const logCalls = [];
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
stub('../src/services/provider-breaker.js', { reset: () => { throw new Error('BOOM_RESET'); }, resetCycle: () => {} });
stub('../src/templates.js', { getActiveMode: () => 'default_en', isElementEnabled: () => false });
stub('../src/services/notifications.js', { dispatchBatch: async () => ({ successful: [], failed: [] }) });
stub('../src/translator-cooldown.js', { resetCycle: () => {}, getCooldownUntil: () => null });
const queue   = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(config.queueFile + '.lock', { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  logCalls.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
async function waitFor(pred, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('waitFor timeout');
}
describe('Sweep timer path catch (BCS P1 / F1)', () => {
  it('timer-path runSweep rejection is caught and logged — no unhandled rejection', async () => {
    await queue.enqueue({ source: 'sonarr', traceId: 't1', seriesId: 1, episodeId: 1, seasonNumber: 1, episodeNumber: 1 });
    await sweeper.scheduleSweep(); // depth 1 < 50 -> timer path (50ms)
    await waitFor(() => logCalls.some(c => c[0] === 'error' && typeof c[2] === 'string' && c[2].includes('Sweep Timer')), 2500);
    const line = logCalls.find(c => c[0] === 'error' && typeof c[2] === 'string' && c[2].includes('Sweep Timer'));
    expect(line).toBeTruthy();
    expect(line[2]).toContain('BOOM_RESET');
  });
});

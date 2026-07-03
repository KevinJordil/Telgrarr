import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-dispatch-throw-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 50;
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const logCalls = [];
const emitted  = [];
const EVENT_TYPES = require('../shared/events.json');
stub('../src/logger.js', { info: (...a) => logCalls.push(['info', ...a]), warn: (...a) => logCalls.push(['warn', ...a]), error: (...a) => logCalls.push(['error', ...a]), audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: (...a) => emitted.push(a), emitThrottled: (...a) => emitted.push(a) });
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
stub('../src/services/notifications.js', { dispatchBatch: async () => { throw new Error('DISPATCH_BOOM'); } });
stub('../src/translator-cooldown.js', { resetCycle: () => {}, getCooldownUntil: () => null });
const queue   = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(config.queueFile + '.lock', { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  logCalls.length = 0;
  emitted.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('Sweep dispatch throw recovery (BCS P1 / F1)', () => {
  it('dispatchBatch throw: caught, logged, SWEEP_ERROR emitted, crash marker KEPT', async () => {
    await queue.enqueue({ source: 'sonarr', traceId: 't1', seriesId: 1, episodeId: 1, seasonNumber: 1, episodeNumber: 1 });
    await sweeper.runSweep();
    expect(sweeper.getQueueState().isSweeping).toBe(false); // finally ran
    const line = logCalls.find(c => c[0] === 'error' && typeof c[2] === 'string' && c[2].includes('Telegram Dispatch'));
    expect(line).toBeTruthy();
    expect(line[2]).toContain('DISPATCH_BOOM');
    const evt = emitted.find(e => e[0] === EVENT_TYPES.SWEEP_ERROR && e[1] === 'error');
    expect(evt).toBeTruthy();
    expect(fs.existsSync(path.join(TMP, 'sweep-state.json'))).toBe(true); // marker kept for crash-recovery
  });
});

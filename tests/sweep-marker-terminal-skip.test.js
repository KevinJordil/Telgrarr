import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-marker-terminal-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 50;
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const emitted = [];
const EVENT_TYPES = require('../shared/events.json');
stub('../src/logger.js', { info: () => {}, warn: () => {}, error: () => {}, audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: (...a) => emitted.push(a), emitThrottled: (...a) => emitted.push(a) });
stub('../src/reconcile-state.js', { recordSent: () => {} });
stub('../src/formatter.js', { buildCaption: async () => 'cap', getPosterUrl: () => null });
stub('../src/radarr-formatter.js', { buildMovieCaption: () => ({ caption: 'cap', pass: 1, length: 0 }), getPosterUrl: () => null });
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
stub('../src/services/notifications.js', { dispatchBatch: async () => ({ successful: [], failed: [] }) });
stub('../src/translator-cooldown.js', { resetCycle: () => {}, getCooldownUntil: () => null });
const queue   = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(config.queueFile + '.lock', { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  emitted.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('Sweep marker terminal skip (BCS P1 / F5, FLAG A)', () => {
  it('zero-message terminal sweep (all posters missing) cleans the crash marker', async () => {
    await queue.enqueue({ source: 'sonarr', traceId: 't1', seriesId: 1, episodeId: 1, seasonNumber: 1, episodeNumber: 1 });
    await sweeper.runSweep();
    expect(sweeper.getQueueState().isSweeping).toBe(false);
    expect(fs.existsSync(path.join(TMP, 'sweep-state.json'))).toBe(false); // no restart resurrection
    const evt = emitted.find(e => e[0] === EVENT_TYPES.SWEEP_ERROR && e[1] === 'warn');
    expect(evt).toBeTruthy(); // existing zero-messages event preserved
  });
});

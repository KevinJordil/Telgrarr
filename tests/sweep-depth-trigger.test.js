import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-sweep-depth-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
stub('../src/reconcile-state.js', { recordSent: () => {} });
stub('../src/formatter.js',       { buildCaption: async () => 'cap', getPosterUrl: () => 'http://p' });
stub('../src/radarr-formatter.js',{ buildMovieCaption: () => ({ caption: 'cap', pass: 1, length: 0 }), getPosterUrl: () => 'http://p' });
stub('../src/emby.js',            { refreshLibrary: async () => false });
stub('../src/history.js',         { addHistory: async () => {}, pruneByAge: async () => 0 });
stub('../src/services/media-enricher.js', { enrichSonarrMedia: async (s) => s, enrichRadarrMedia: async (m, t) => ({ movie: m, tmdbMovie: t, ratings: {} }) });
stub('../src/utils/media-utils.js', { resolveRating: () => null });
stub('../src/services/metadata.js', {
  fetchSonarrMetadata: async () => ({ series: { title: 'T', year: 2020, imdbId: null, tmdbId: null, tvdbId: null }, tmdbSeries: { episode_run_time: [] }, omdbData: null }),
  fetchRadarrMetadata: async () => ({ movie: { title: 'M', year: 2020, imdbId: null, tmdbId: null }, tmdbMovie: null, omdbData: null }),
});
stub('../src/services/provider-breaker.js', { reset: () => {} });
stub('../src/templates.js', { getActiveMode: () => 'default_en', isElementEnabled: () => false });
stub('../src/services/notifications.js', { dispatchBatch: async () => ({ successful: [], failed: [] }) });
const queue       = require('../src/queue.js');
const events      = require('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');
const sweeper     = require('../src/sweeper.js');
const emitted = [];
const origEmit = events.emit.bind(events);
events.emit = (...a) => { emitted.push(a); return origEmit(...a); };
async function drain(ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!sweeper.getQueueState().isSweeping
        && !sweeper.getQueueState().active
        && (await queue.peekLength()) === 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}
beforeEach(async () => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(`${config.queueFile}.lock`, { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  // Drain any leftover state from a prior test (timer + in-flight sweep).
  await drain(3000);
  emitted.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
const son = (id) => ({ source: 'sonarr', traceId: `t${id}`, seriesId: 1, episodeId: id, seasonNumber: 1, episodeNumber: id });
describe('Depth-triggered scheduleSweep (BLR-1 / DEC-BLR-3)', () => {
  it('depth >= 50 → setImmediate dispatch (NO batchTimer armed); queue drains', async () => {
    config.batchWindowMs = 60_000;
    for (let i = 1; i <= 60; i++) await queue.enqueue(son(i));
    await sweeper.scheduleSweep();
    expect(sweeper.getQueueState().active).toBe(false);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (!sweeper.getQueueState().isSweeping && (await queue.peekLength()) === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await queue.peekLength()).toBe(0);
    const timerEvt = emitted.find((a) => a[0] === EVENT_TYPES.QUEUE_TIMER_STARTED);
    expect(timerEvt).toBeUndefined();
  });
  it('in-flight sweep: parallel scheduleSweep does NOT arm a timer', async () => {
    config.batchWindowMs = 60_000;
    for (let i = 1; i <= 60; i++) await queue.enqueue(son(i));
    await sweeper.scheduleSweep();
    await sweeper.scheduleSweep();
    expect(sweeper.getQueueState().active).toBe(false);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (!sweeper.getQueueState().isSweeping && (await queue.peekLength()) === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await queue.peekLength()).toBe(0);
  });
  it('depth < 50 → arms normal batchTimer; timer fires and drains queue', async () => {
    config.batchWindowMs = 100;
    for (let i = 1; i <= 10; i++) await queue.enqueue(son(i));
    await sweeper.scheduleSweep();
    expect(sweeper.getQueueState().active).toBe(true);
    const timerEvt = emitted.find((a) => a[0] === EVENT_TYPES.QUEUE_TIMER_STARTED);
    expect(timerEvt).toBeDefined();
    expect(await queue.peekLength()).toBe(10);
    const t0 = Date.now();
    while (Date.now() - t0 < 3000) {
      if (!sweeper.getQueueState().isSweeping
          && !sweeper.getQueueState().active
          && (await queue.peekLength()) === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(await queue.peekLength()).toBe(0);
  });
});

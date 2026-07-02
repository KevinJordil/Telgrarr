import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-sweep-cont-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile     = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 80;
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
stub('../src/services/provider-breaker.js', { reset: () => {}, resetCycle: () => {} });
stub('../src/templates.js', { getActiveMode: () => 'default_en', isElementEnabled: () => false });
let dispatchGate = null;
stub('../src/services/notifications.js', {
  dispatchBatch: async () => {
    if (dispatchGate) await dispatchGate;
    return { successful: [], failed: [] };
  },
});
const queue   = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');
beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(`${config.queueFile}.lock`, { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  dispatchGate = null;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
const son = (id) => ({ source: 'sonarr', traceId: `t${id}`, seriesId: 1, episodeId: id, seasonNumber: 1, episodeNumber: id });
async function waitFor(pred, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error('waitFor timeout');
}
describe('Sweep continuity (BLR-1 / DEC-BLR-1: pendingSweep + tail-rearm)', () => {
  it('scheduleSweep during an in-flight sweep sets pendingSweep — no new timer', async () => {
    await queue.enqueue(son(1));
    let release;
    dispatchGate = new Promise((r) => { release = r; });
    const sweepP = sweeper.runSweep();
    await waitFor(() => sweeper.getQueueState().isSweeping === true);
    await sweeper.scheduleSweep();
    expect(sweeper.getQueueState().active).toBe(false);   // no parallel timer
    release();
    await sweepP;
    await waitFor(() => sweeper.getQueueState().active === true, 500); // let rearm settle (polled, not fixed-sleep — avoids full-suite-load flake)
    expect(sweeper.getQueueState().active).toBe(true);   // pendingSweep consumed → timer armed
    await new Promise((r) => setTimeout(r, 200));        // drain rearmed timer
  });
  it('queue-empty after sweep does NOT rearm (no pendingSweep, peekLength === 0)', async () => {
    await queue.enqueue(son(99));
    await sweeper.runSweep();
    await new Promise((r) => setTimeout(r, 40));
    expect(sweeper.getQueueState().active).toBe(false);
    expect(sweeper.getQueueState().isSweeping).toBe(false);
  });
  it('queue non-empty after sweep rearms (belt-and-braces, no pendingSweep)', async () => {
    await queue.enqueue(son(1));
    let release;
    dispatchGate = new Promise((r) => { release = r; });
    const sweepP = sweeper.runSweep();
    await waitFor(() => sweeper.getQueueState().isSweeping === true);
    // Enqueue an item DIRECTLY (bypasses scheduleSweep so pendingSweep stays false).
    await queue.enqueue(son(2));
    release();
    await sweepP;
    await waitFor(() => sweeper.getQueueState().active === true, 500);
    expect(sweeper.getQueueState().active).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
  });
});

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-sweep-pool-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
config.batchWindowMs = 80;

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

stub('../src/reconcile-state.js', { recordSent: () => {} });
stub('../src/formatter.js', { buildCaption: async () => 'cap', getPosterUrl: () => 'http://p' });
stub('../src/radarr-formatter.js', { buildMovieCaption: () => ({ caption: 'cap', pass: 1, length: 0 }), getPosterUrl: () => 'http://p' });
stub('../src/emby.js', { refreshLibrary: async () => false });
stub('../src/history.js', { addHistory: async () => {}, pruneByAge: async () => 0 });
stub('../src/services/media-enricher.js', {
  enrichSonarrMedia: async (s) => s,
  enrichRadarrMedia: async (m, t) => ({ movie: m, tmdbMovie: t, ratings: {} }),
});
stub('../src/utils/media-utils.js', { resolveRating: () => null });
stub('../src/services/provider-breaker.js', { reset: () => {} });
stub('../src/templates.js', { getActiveMode: () => 'default_en', isElementEnabled: () => false });

let inFlight = 0;
let maxInFlight = 0;
// Higher seriesId resolves FASTER -- completion order is the REVERSE of
// input order, so a bug that flattened by completion order instead of
// input order would flip the resulting titles[] and fail immediately.
const DELAYS = { 1: 70, 2: 60, 3: 50, 4: 40, 5: 30, 6: 20, 7: 10 };
stub('../src/services/metadata.js', {
  fetchSonarrMetadata: async (seriesId) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, DELAYS[seriesId] || 10));
    inFlight--;
    return {
      series: { title: `Series ${seriesId}`, year: 2020, imdbId: null, tmdbId: null, tvdbId: null },
      tmdbSeries: { episode_run_time: [] },
      omdbData: null,
    };
  },
  fetchRadarrMetadata: async () => ({ movie: { title: 'M', year: 2020, imdbId: null, tmdbId: null }, tmdbMovie: null, omdbData: null }),
});

let dispatchCalls;
stub('../src/services/notifications.js', {
  dispatchBatch: async (messages, historyItems) => {
    dispatchCalls.push({ messages, historyItems });
    return { successful: historyItems, failed: [] };
  },
});

const queue = require('../src/queue.js');
const sweeper = require('../src/sweeper.js');

beforeEach(() => {
  try { fs.unlinkSync(config.queueFile); } catch (_) {}
  try { fs.rmSync(`${config.queueFile}.lock`, { recursive: true, force: true }); } catch (_) {}
  fs.writeFileSync(config.queueFile, '[]', 'utf8');
  try { fs.unlinkSync(path.join(TMP, 'sweep-state.json')); } catch (_) {}
  inFlight = 0;
  maxInFlight = 0;
  dispatchCalls = [];
});

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

const son = (seriesId) => ({ source: 'sonarr', traceId: `t${seriesId}`, seriesId, episodeId: 1, seasonNumber: 1, episodeNumber: 1 });

describe('Sweeper metadata bounded concurrency (BLR Phase 3 / C-10, DEC-BLR-11/12)', () => {
  it('caps concurrent metadata fetches at METADATA_CONCURRENCY (5); dispatch stays one sequential call with input order preserved', async () => {
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      await queue.enqueue(son(id));
    }
    await sweeper.runSweep();

    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(5);

    expect(dispatchCalls).toHaveLength(1);
    const titles = dispatchCalls[0].historyItems.map((h) => h.title);
    expect(titles).toEqual([
      'Series 1', 'Series 2', 'Series 3', 'Series 4', 'Series 5', 'Series 6', 'Series 7',
    ]);
    expect(dispatchCalls[0].messages.length).toBe(7);
  });

  it('an empty queue never invokes fetchers or dispatch (parity, unaffected by pooling)', async () => {
    await sweeper.runSweep();
    expect(dispatchCalls).toHaveLength(0);
    expect(maxInFlight).toBe(0);
  });
});

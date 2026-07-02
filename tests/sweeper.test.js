import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// O5 regression guard: runSweep must emit SWEEP_EMBY ONLY when a refresh actually
// fired. An unconfigured Emby skip (refreshLibrary -> false) must NOT surface the
// phantom success event to the GUI. Idiom matches media-cache.test.js: no vi.mock —
// deps are injected into require.cache BEFORE sweeper is required; shared/events.json
// loads for real so we compare against the real SWEEP_EMBY constant.

const EVENT_TYPES = require('../shared/events.json');

let emitCalls = [];
let embyReturn = false;

function stub(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

stub('../src/config.js', { DATA_DIR: path.join(os.tmpdir(), 'telgrarr-sweeper-test-' + process.pid), batchWindowMs: 1000, tmdb: { language: 'en' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
stub('../src/events.js', { emit: (type, ...rest) => { emitCalls.push({ type, rest }); } });
stub('../src/queue.js', {
  drainQueue: async () => [{ source: 'radarr', movieId: '123', traceId: 't1' }],
  enqueue: async () => {},
  markSweepCycle: () => {},
  // Mirrors src/queue.js identityKey (independently covered by queue-identity.test.js);
  // a hermetic double so the sweeper ledger write-back can resolve identity keys.
  identityKey: (item) => {
    if (!item || typeof item !== 'object') return null;
    if (item.source === 'sonarr' && item.seriesId != null) {
      if (item.episodeId != null) return `sonarr:${item.seriesId}:eid:${item.episodeId}`;
      if (item.seasonNumber != null && item.episodeNumber != null) {
        return `sonarr:${item.seriesId}:s${item.seasonNumber}e${item.episodeNumber}`;
      }
      return null;
    }
    if (item.source === 'radarr' && item.movieId != null) return `radarr:${item.movieId}`;
    return null;
  },
});
stub('../src/formatter.js', { buildCaption: async () => 'caption', getPosterUrl: () => 'http://poster/show' });
stub('../src/radarr-formatter.js', {
  buildMovieCaption: () => ({ caption: 'caption', pass: 1, length: 42 }),
  getPosterUrl: () => 'http://poster/movie',
});
stub('../src/emby.js', { refreshLibrary: async () => embyReturn });
stub('../src/history.js', { addHistory: async () => {} });
stub('../src/services/media-enricher.js', {
  enrichRadarrMedia: async (movie, tmdbMovie) => ({ movie, tmdbMovie, ratings: {} }),
});
stub('../src/services/metadata.js', {
  fetchSonarrMetadata: async () => ({ series: { title: 'Show', year: 2020 }, tmdbSeries: null, omdbData: null }),
  fetchRadarrMetadata: async () => ({
    movie: { title: 'Movie', year: 2021, imdbId: 'tt1', tmdbId: 1 },
    tmdbMovie: { runtime: 100 },
    omdbData: {},
  }),
});
let dispatchOverride = null;
stub('../src/services/notifications.js', {
  dispatchBatch: async (messages, historyItems) =>
    dispatchOverride ? dispatchOverride(messages, historyItems) : ({ successful: historyItems, failed: [] }),
});
let recordSentCalls = [];
stub('../src/reconcile-state.js', {
  recordSent: (source, keys) => { recordSentCalls.push({ source, keys }); },
});
stub('../src/templates.js', { getActiveMode: () => 'standard', isElementEnabled: () => true });
stub('write-file-atomic', (file, data, cb) => { if (cb) cb(null); });

// Guard ANY sweep-state.json path (hardcoded or DATA_DIR-derived) so the test can
// never read or unlink real app state, regardless of how SWEEP_STATE_FILE resolves.
const origExists = fs.existsSync;
fs.existsSync = (p) =>
  (typeof p === 'string' && p.endsWith('sweep-state.json') ? false : origExists(p));
afterAll(() => { fs.existsSync = origExists; });

let sweeper;
beforeEach(() => {
  emitCalls = [];
  recordSentCalls = [];
  dispatchOverride = null;
  delete require.cache[require.resolve('../src/sweeper.js')];
  sweeper = require('../src/sweeper.js');
});

describe('Sweeper Emby emit (O5 — phantom SWEEP_EMBY suppression)', () => {
  it('does NOT emit SWEEP_EMBY when refreshLibrary returns false (unconfigured skip)', async () => {
    embyReturn = false;
    await sweeper.runSweep();
    const embyEmits = emitCalls.filter((e) => e.type === EVENT_TYPES.SWEEP_EMBY);
    expect(embyEmits).toHaveLength(0);
  });

  it('emits SWEEP_EMBY exactly once when refreshLibrary returns true (real refresh)', async () => {
    embyReturn = true;
    await sweeper.runSweep();
    const embyEmits = emitCalls.filter((e) => e.type === EVENT_TYPES.SWEEP_EMBY);
    expect(embyEmits).toHaveLength(1);
  });
});

describe('Sweeper reconcile ledger write-back (STEP 2.4 / WR-3 / C-LEDGER)', () => {
  it('records sent identityKeys on dispatch success (radarr)', async () => {
    embyReturn = false;
    await sweeper.runSweep();
    expect(recordSentCalls).toEqual([{ source: 'radarr', keys: ['radarr:123'] }]);
  });

  it('does NOT record when dispatch fails (lossless: item stays eligible)', async () => {
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: '429' })),
    });
    await sweeper.runSweep();
    expect(recordSentCalls).toHaveLength(0);
  });
});

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
});
stub('../src/formatter.js', { buildCaption: () => 'caption', getPosterUrl: () => 'http://poster/show' });
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
  fetchSonarrMetadata: async () => ({ title: 'Show', year: 2020 }),
  fetchRadarrMetadata: async () => ({
    movie: { title: 'Movie', year: 2021, imdbId: 'tt1', tmdbId: 1 },
    tmdbMovie: { runtime: 100 },
    omdbData: {},
  }),
});
stub('../src/services/notifications.js', {
  dispatchBatch: async (messages, historyItems) => ({ successful: historyItems, failed: [] }),
});
stub('../src/templates.js', { getActiveMode: () => 'standard' });
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

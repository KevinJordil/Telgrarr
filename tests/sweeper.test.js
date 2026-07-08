import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
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
let enqueueManyCalls = [];
let enqueueManyImpl = async (items) => items.length;
// FA-2/D-2a: mutable indirection (same pattern as dispatchOverride/embyReturn below) so
// individual tests can simulate a raw drained item that already carries a prior
// _dispatchAttempts count.
let drainQueueReturn = [{ source: 'radarr', movieId: '123', traceId: 't1' }];

function stub(relPath, exports) {
  const resolved = require.resolve(relPath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

const TEST_DATA_DIR = path.join(os.tmpdir(), 'telgrarr-sweeper-test-' + process.pid);
const SWEEP_STATE_FILE = path.join(TEST_DATA_DIR, 'sweep-state.json'); // mirrors src/sweeper.js's own formula
const configStub = {
  DATA_DIR: TEST_DATA_DIR,
  batchWindowMs: 1000,
  tmdb: { language: 'en' },
  translator: { targetLang: 'ar' },
  // FA-7: sweeper.js now sources its fallback from config.DEFAULTS.translator.targetLang
  // (R13 single source) instead of a duplicated 'ar' literal -- mirror the real config.js
  // shape or every historyItem construction in this suite throws.
  DEFAULTS: { translator: { targetLang: 'ar' } },
};
stub('../src/config.js', configStub);
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
stub('../src/events.js', { emit: (type, ...rest) => { emitCalls.push({ type, rest }); } });
stub('../src/queue.js', {
  drainQueue: async () => drainQueueReturn,
  enqueueMany: async (items) => { enqueueManyCalls.push(items); return enqueueManyImpl(items); },
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
  enqueueManyCalls = [];
  enqueueManyImpl = async (items) => items.length;
  drainQueueReturn = [{ source: 'radarr', movieId: '123', traceId: 't1' }];
  configStub.translator.targetLang = 'ar';
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
      failed: historyItems.map((item) => ({ item, error: '429', retryable: true })),
    });
    await sweeper.runSweep();
    expect(recordSentCalls).toHaveLength(0);
    // FA-2/D-2a: "stays eligible" now also means the sweeper itself requeues a
    // retryable failure, in addition to the pre-existing reconciler safety net.
    expect(enqueueManyCalls).toHaveLength(1);
    expect(enqueueManyCalls[0]).toHaveLength(1);
    expect(enqueueManyCalls[0][0]._dispatchAttempts).toBe(1);
  });
});


describe('Sweeper dispatch-failure retry/abandon (FA-2/D-2a, MAX_DISPATCH_ATTEMPTS)', () => {
  it('a retryable failure under the cap is requeued via ONE enqueueMany call, attempts incremented from 0', async () => {
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: '429', retryable: true })),
    });
    await sweeper.runSweep();
    expect(enqueueManyCalls).toHaveLength(1);
    expect(enqueueManyCalls[0]).toHaveLength(1);
    expect(enqueueManyCalls[0][0].movieId).toBe('123');
    expect(enqueueManyCalls[0][0]._dispatchAttempts).toBe(1);
  });

  it('a non-retryable (permanent) failure is never requeued, and emits SWEEP_ITEM_ABANDONED', async () => {
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: 'Forbidden', retryable: false })),
    });
    await sweeper.runSweep();
    expect(enqueueManyCalls).toHaveLength(0);
    const abandonedEmits = emitCalls.filter((e) => e.type === EVENT_TYPES.SWEEP_ITEM_ABANDONED);
    expect(abandonedEmits).toHaveLength(1);
  });

  it('a retryable failure already at MAX_DISPATCH_ATTEMPTS is abandoned instead of requeued again', async () => {
    drainQueueReturn = [{ source: 'radarr', movieId: '123', traceId: 't1', _dispatchAttempts: 3 }];
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: '429', retryable: true })),
    });
    await sweeper.runSweep();
    expect(enqueueManyCalls).toHaveLength(0);
    const abandonedEmits = emitCalls.filter((e) => e.type === EVENT_TYPES.SWEEP_ITEM_ABANDONED);
    expect(abandonedEmits).toHaveLength(1);
  });
});

describe('Sweeper dispatch-failure marker cleanup (FA-2/D-2a, dispatchFailureHandled)', () => {
  const ambientExistsSync = fs.existsSync;
  let unlinkSyncOrig, unlinkCalls;
  beforeEach(() => {
    unlinkCalls = [];
    unlinkSyncOrig = fs.unlinkSync;
    fs.existsSync = (p) => (p === SWEEP_STATE_FILE ? true : ambientExistsSync(p));
    fs.unlinkSync = (p) => { if (p === SWEEP_STATE_FILE) { unlinkCalls.push(p); return; } return unlinkSyncOrig(p); };
  });
  afterEach(() => {
    fs.existsSync = ambientExistsSync;
    fs.unlinkSync  = unlinkSyncOrig;
  });

  it('FA-2: a total-failure sweep (non-retryable) now cleans the crash marker (was: silently retained forever until the next sweep clobbered it)', async () => {
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: 'Forbidden', retryable: false })),
    });
    await sweeper.runSweep();
    expect(unlinkCalls).toEqual([SWEEP_STATE_FILE]);
  });

  it('FA-2: a total-failure sweep (retryable) requeues the item AND cleans the crash marker', async () => {
    embyReturn = false;
    dispatchOverride = (messages, historyItems) => ({
      successful: [],
      failed: historyItems.map((item) => ({ item, error: '503', retryable: true })),
    });
    await sweeper.runSweep();
    expect(unlinkCalls).toEqual([SWEEP_STATE_FILE]);
    expect(enqueueManyCalls).toHaveLength(1);
  });

  it('a dispatchBatch THROW (distinct from a per-item failure) still retains the marker -- untouched path, parity', async () => {
    dispatchOverride = () => { throw new Error('network down'); };
    await sweeper.runSweep();
    expect(unlinkCalls).toHaveLength(0);
  });
});

describe('Sweeper crash recovery (FA-8 — recoverCrashedSweep via single enqueueMany)', () => {
  const ambientExistsSync = fs.existsSync;
  let readFileSyncOrig, unlinkSyncOrig, unlinkCalls, fakeMarkerContent;

  beforeEach(() => {
    unlinkCalls = [];
    fakeMarkerContent = null;
    readFileSyncOrig = fs.readFileSync;
    unlinkSyncOrig   = fs.unlinkSync;
    fs.existsSync = (p) => (p === SWEEP_STATE_FILE ? fakeMarkerContent !== null : ambientExistsSync(p));
    fs.readFileSync = (p, enc) => (p === SWEEP_STATE_FILE ? fakeMarkerContent : readFileSyncOrig(p, enc));
    fs.unlinkSync = (p) => { if (p === SWEEP_STATE_FILE) { unlinkCalls.push(p); return; } return unlinkSyncOrig(p); };
  });

  afterEach(() => {
    fs.existsSync   = ambientExistsSync;
    fs.readFileSync = readFileSyncOrig;
    fs.unlinkSync   = unlinkSyncOrig;
  });

  it('calls enqueueMany ONCE with the full orphaned batch, then deletes the marker', async () => {
    fakeMarkerContent = JSON.stringify([{ source: 'radarr', movieId: 'x' }, { source: 'radarr', movieId: 'y' }]);
    const result = await sweeper.recoverCrashedSweep();
    expect(result).toBe(true);
    expect(enqueueManyCalls).toHaveLength(1);
    expect(enqueueManyCalls[0]).toHaveLength(2);
    expect(unlinkCalls).toEqual([SWEEP_STATE_FILE]);
  });

  it('returns false and calls nothing when no marker file exists (parity)', async () => {
    fakeMarkerContent = null;
    const result = await sweeper.recoverCrashedSweep();
    expect(result).toBe(false);
    expect(enqueueManyCalls).toHaveLength(0);
  });

  it('skips enqueueMany for an empty-array marker but still deletes it (parity)', async () => {
    fakeMarkerContent = JSON.stringify([]);
    const result = await sweeper.recoverCrashedSweep();
    expect(result).toBe(true);
    expect(enqueueManyCalls).toHaveLength(0);
    expect(unlinkCalls).toEqual([SWEEP_STATE_FILE]);
  });

  it('returns false and retains the marker on malformed JSON (parity)', async () => {
    fakeMarkerContent = '{not valid json';
    const result = await sweeper.recoverCrashedSweep();
    expect(result).toBe(false);
    expect(enqueueManyCalls).toHaveLength(0);
    expect(unlinkCalls).toHaveLength(0);
  });

  it('FA-8: an enqueueMany failure retains the marker for a clean all-or-nothing retry (declared behavior change)', async () => {
    fakeMarkerContent = JSON.stringify([{ source: 'radarr', movieId: 'z' }]);
    enqueueManyImpl = async () => { throw new Error('simulated batch write failure'); };
    const result = await sweeper.recoverCrashedSweep();
    expect(result).toBe(false);
    expect(enqueueManyCalls).toHaveLength(1);
    expect(unlinkCalls).toHaveLength(0);
  });
});

describe('Sweeper history language field (FA-7 — R13 single default source, no duplicated literal)', () => {
  it('uses config.translator.targetLang when explicitly set to a non-default language', async () => {
    configStub.translator.targetLang = 'fr';
    embyReturn = false;
    let captured = null;
    dispatchOverride = (messages, historyItems) => { captured = historyItems; return { successful: historyItems, failed: [] }; };
    await sweeper.runSweep();
    expect(captured[0].language).toBe('fr');
  });

  it('falls back to config.DEFAULTS.translator.targetLang when config.translator.targetLang is falsy', async () => {
    configStub.translator.targetLang = '';
    embyReturn = false;
    let captured = null;
    dispatchOverride = (messages, historyItems) => { captured = historyItems; return { successful: historyItems, failed: [] }; };
    await sweeper.runSweep();
    expect(captured[0].language).toBe(configStub.DEFAULTS.translator.targetLang);
    expect(captured[0].language).toBe('ar');
  });
});

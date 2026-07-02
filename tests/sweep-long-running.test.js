import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
const require = createRequire(import.meta.url);

const SUT = require.resolve('../src/sweeper.js');
const R = (p) => require.resolve(p);
const EVENT_TYPES = require('../shared/events.json');
const WINDOW = 100; // 2x threshold = 200ms

function stub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

let emitted, cycleCalls, drainImpl, sweeper;
function fresh() {
  delete require.cache[SUT];
  emitted = [];
  cycleCalls = { mark: [], breaker: [], cooldown: [] };
  drainImpl = async () => [];
  stub(R('../src/queue.js'), {
    drainQueue: (...a) => drainImpl(...a),
    enqueue: async () => true,
    peekLength: async () => 0,
    identityKey: () => null,
    markSweepCycle: (id) => cycleCalls.mark.push(id),
  });
  stub(R('../src/reconcile-state.js'), { recordSent: () => {} });
  stub(R('../src/formatter.js'), { buildCaption: async () => 'c', getPosterUrl: () => null });
  stub(R('../src/radarr-formatter.js'), { buildMovieCaption: () => ({ caption: 'c', pass: 1, length: 1 }), getPosterUrl: () => null });
  stub(R('../src/emby.js'), { refreshLibrary: async () => false });
  stub(R('../src/history.js'), { addHistory: async () => {}, pruneByAge: async () => 0 });
  stub(R('../src/services/media-enricher.js'), { enrichSonarrMedia: async (s) => s, enrichRadarrMedia: async (m) => ({ movie: m, tmdbMovie: null, ratings: {} }) });
  stub(R('../src/utils/media-utils.js'), { resolveRating: () => null });
  stub(R('../src/services/metadata.js'), { fetchSonarrMetadata: async () => ({}), fetchRadarrMetadata: async () => ({}) });
  stub(R('../src/services/notifications.js'), { dispatchBatch: async () => ({ successful: [], failed: [] }) });
  stub(R('../src/templates.js'), { getActiveMode: () => 'default', isElementEnabled: () => false });
  stub(R('../src/config.js'), { DATA_DIR: os.tmpdir(), batchWindowMs: WINDOW, history: {}, translator: {} });
  stub(R('../src/logger.js'), { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
  stub(R('../src/events.js'), { emit(type, level, module, message, data) { emitted.push({ type, level, message, data }); } });
  stub(R('../src/services/provider-breaker.js'), { reset: () => {}, resetCycle: (id) => cycleCalls.breaker.push(id) });
  stub(R('../src/translator-cooldown.js'), { resetCycle: (id) => cycleCalls.cooldown.push(id) });
  sweeper = require('../src/sweeper.js');
}
function longEvents() { return emitted.filter((e) => e.type === EVENT_TYPES.SWEEP_LONG_RUNNING); }

beforeEach(() => { vi.useFakeTimers(); fresh(); });
afterEach(() => { vi.useRealTimers(); });

describe('SWEEP_LONG_RUNNING watchdog + cycle re-arm (BLR Phase 4, DEC-BLR-22/23)', () => {
  it('fires exactly once when a sweep exceeds 2x the batch window', async () => {
    let resolveDrain;
    drainImpl = () => new Promise((res) => { resolveDrain = res; });
    const p = sweeper.runSweep();
    await vi.advanceTimersByTimeAsync(2 * WINDOW + 10);
    expect(longEvents().length).toBe(1);
    expect(longEvents()[0].level).toBe('warn');
    expect(longEvents()[0].data.thresholdMs).toBe(2 * WINDOW);
    expect(typeof longEvents()[0].data.startedAtMs).toBe('number');
    await vi.advanceTimersByTimeAsync(4 * WINDOW);
    expect(longEvents().length).toBe(1);
    resolveDrain([]);
    await p;
  });

  it('does not fire for a sweep that completes inside the threshold', async () => {
    await sweeper.runSweep();
    await vi.advanceTimersByTimeAsync(4 * WINDOW);
    expect(longEvents().length).toBe(0);
  });

  it('re-arms all three cycle trackers once per sweep with one shared id, incrementing across sweeps', async () => {
    await sweeper.runSweep();
    expect(cycleCalls.mark).toEqual([1]);
    expect(cycleCalls.breaker).toEqual([1]);
    expect(cycleCalls.cooldown).toEqual([1]);
    await sweeper.runSweep();
    expect(cycleCalls.mark).toEqual([1, 2]);
    expect(cycleCalls.breaker).toEqual([1, 2]);
    expect(cycleCalls.cooldown).toEqual([1, 2]);
  });

  it('getSweepStats starts empty and inactive', () => {
    expect(sweeper.getSweepStats()).toEqual({ active: false, startedAt: null, durationMs: null, lastCompletedAt: null });
  });

  it('getSweepStats reports completion data after a sweep; getQueueState is untouched', async () => {
    await sweeper.runSweep();
    const s = sweeper.getSweepStats();
    expect(s.active).toBe(false);
    expect(typeof s.startedAt).toBe('string');
    expect(typeof s.lastCompletedAt).toBe('string');
    expect(typeof s.durationMs).toBe('number');
    expect(s.durationMs).toBeGreaterThanOrEqual(0);
    expect(sweeper.getQueueState()).toEqual({ active: false, expiresAt: null, isSweeping: false });
  });
});

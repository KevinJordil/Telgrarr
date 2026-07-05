import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const axios          = require('axios');
const config         = require('../src/config.js');
const queue          = require('../src/queue.js');
const blacklist      = require('../src/blacklist.js');
const reconcileState = require('../src/reconcile-state.js');
const events         = require('../src/events.js');
const EVENT_TYPES    = require('../shared/events.json');
const reconciler     = require('../src/services/reconciler.js');

const NOW = new Date('2025-01-15T12:00:00.000Z').getTime();

function sonarrHistoryRecord(id, dateIso, seriesId, episodeId, season, episode) {
  return {
    id, eventType: 'downloadFolderImported', date: dateIso, seriesId, episodeId,
    episode: { seasonNumber: season, episodeNumber: episode },
    series: { id: seriesId, path: `/tv/series-${seriesId}` },
  };
}
const pageResp = (records) => ({ data: { records } });

// FA-37 (Master §7 BLR SD-4 symmetry): reconciler.js's catch-up enqueue emitted a
// malformed 2-arg events.emit() call against the 5-positional contract. This suite
// proves the fix: correct payload shape, and that emitThrottled's coalescing
// mechanism actually engages under a burst (mirroring the webhook sites).
describe('FA-37: reconciler emits QUEUE_ITEM_ADDED in the correct throttled shape', () => {
  let origSonarr, origRadarr;

  beforeEach(() => {
    origSonarr = config.sonarr;
    origRadarr = config.radarr;
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'sk' };
    config.radarr = { baseUrl: 'http://radarr.test', apiKey: 'rk' };

    vi.spyOn(reconcileState, 'getState').mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    vi.spyOn(reconcileState, 'setSince').mockImplementation(() => {});
    vi.spyOn(reconcileState, 'isSent').mockReturnValue(false);
    vi.spyOn(reconcileState, 'recordSent').mockImplementation(() => {});
    vi.spyOn(queue, 'enqueue').mockResolvedValue(true);
    vi.spyOn(blacklist, 'isIdBlacklisted').mockReturnValue(false);
    vi.spyOn(blacklist, 'isPathBlacklisted').mockReturnValue(false);
    vi.spyOn(axios, 'get').mockResolvedValue(pageResp([]));

    // Isolate from any other test's un-expired coalescing window (module-level state).
    events.resetThrottleState();
  });

  afterEach(() => {
    config.sonarr = origSonarr;
    config.radarr = origRadarr;
    vi.restoreAllMocks();
    events.resetThrottleState();
  });

  it('emits the correct 5-positional-equivalent throttled shape', async () => {
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce(pageResp([sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1)]))
      .mockResolvedValueOnce(pageResp([]));

    const emitThrottledSpy = vi.spyOn(events, 'emitThrottled');
    await reconciler.reconcile({ now: NOW });

    expect(emitThrottledSpy).toHaveBeenCalledTimes(1);
    const [type, payload] = emitThrottledSpy.mock.calls[0];
    expect(type).toBe(EVENT_TYPES.QUEUE_ITEM_ADDED);
    expect(payload.level).toBe('info');
    expect(payload.module).toBe('Reconcile');
    expect(typeof payload.message).toBe('string');
    expect(payload.message).toContain('sonarr:5:eid:51');
    expect(payload.data).toMatchObject({ source: 'sonarr', viaReconcile: true, idKey: 'sonarr:5:eid:51' });
    expect(typeof payload.data.traceId).toBe('string');
  });

  it('coalesces a burst of enqueues into ONE real QUEUE_ITEM_ADDED bus emission', async () => {
    // Dates MUST land after the mocked `since` (2025-01-10) minus the 5-min safety
    // margin, or fetchImportHistorySince filters them out entirely.
    const records = [];
    for (let i = 1; i <= 5; i += 1) {
      records.push(sonarrHistoryRecord(100 + i, `2025-01-1${i}T00:00:00.000Z`, 5, 50 + i, 1, i));
    }
    vi.spyOn(axios, 'get')
      .mockResolvedValueOnce(pageResp(records))
      .mockResolvedValueOnce(pageResp([]));

    // NOTE: events.bus is the SHARED sink for both domain events and logger.js's
    // per-log-line SSE mirror (every log.info/warn/error call also calls
    // events.emit -> bus.emit('event', ...) -- logger.js's documented, by-design
    // mirroring; see Roadmap FA-6a). The reconciler logs several lines
    // (Starting/Enqueued x5/Done/No-new-imports/Complete) alongside the emit
    // under test, so raw bus.emit CALL COUNT is not a safe proxy for coalescing.
    // Filter to the event TYPE under test instead.
    const busEmitSpy = vi.spyOn(events.bus, 'emit');
    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(5);
    const queueItemAddedEmits = busEmitSpy.mock.calls.filter(
      (call) => call[0] === 'event' && call[1] && call[1].type === EVENT_TYPES.QUEUE_ITEM_ADDED
    );
    expect(queueItemAddedEmits).toHaveLength(1);
  });
});

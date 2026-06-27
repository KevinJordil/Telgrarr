import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const axios          = require('axios');
const config         = require('../src/config.js');
const queue          = require('../src/queue.js');
const blacklist      = require('../src/blacklist.js');
const reconcileState = require('../src/reconcile-state.js');
const reconciler     = require('../src/services/reconciler.js');

const NOW = new Date('2025-01-15T12:00:00.000Z').getTime();

function sonarrHistoryRecord(id, dateIso, seriesId, episodeId, season, episode, opts = {}) {
  return {
    id,
    eventType: opts.eventType || 'downloadFolderImported',
    date: dateIso,
    seriesId,
    episodeId,
    episode: { seasonNumber: season, episodeNumber: episode },
    series: { id: seriesId, path: opts.path || `/tv/series-${seriesId}` },
  };
}

function radarrHistoryRecord(id, dateIso, movieId, opts = {}) {
  return {
    id,
    eventType: opts.eventType || 'downloadFolderImported',
    date: dateIso,
    movieId,
    movie: { id: movieId, path: opts.path || `/movies/movie-${movieId}` },
  };
}

const pageResp = (records) => ({ data: { records } });

describe('reconciler.reconcile (STEP 2.3 / WR-3..WR-15 / C-IDENTITY / F-6)', () => {
  let origSonarr, origRadarr;
  let getStateMock, setSinceMock, isSentMock;
  let enqueueMock, isIdBlMock, isPathBlMock, axiosGetMock;

  beforeEach(() => {
    origSonarr = config.sonarr;
    origRadarr = config.radarr;
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'sk' };
    config.radarr = { baseUrl: 'http://radarr.test', apiKey: 'rk' };

    getStateMock = vi.spyOn(reconcileState, 'getState').mockReturnValue({
      sonarr: { since: null, sentKeys: [] },
      radarr: { since: null, sentKeys: [] },
    });
    setSinceMock = vi.spyOn(reconcileState, 'setSince').mockImplementation(() => {});
    isSentMock   = vi.spyOn(reconcileState, 'isSent').mockReturnValue(false);
    vi.spyOn(reconcileState, 'recordSent').mockImplementation(() => {});
    enqueueMock  = vi.spyOn(queue, 'enqueue').mockResolvedValue(true);
    isIdBlMock   = vi.spyOn(blacklist, 'isIdBlacklisted').mockReturnValue(false);
    isPathBlMock = vi.spyOn(blacklist, 'isPathBlacklisted').mockReturnValue(false);
    axiosGetMock = vi.spyOn(axios, 'get').mockResolvedValue(pageResp([]));
  });

  afterEach(() => {
    config.sonarr = origSonarr;
    config.radarr = origRadarr;
    vi.restoreAllMocks();
  });

  // ── first-run seed (WR-4) ──

  it('first run (since=null): seeds since to newest import date, enqueues nothing', async () => {
    const newestIso = '2025-01-14T10:00:00.000Z';
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(100, newestIso, 5, 50, 1, 1),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([])); // radarr empty

    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(setSinceMock).toHaveBeenCalledWith('sonarr', newestIso);
    expect(setSinceMock).toHaveBeenCalledWith('radarr', new Date(NOW).toISOString());
  });

  it('first run with no imports anywhere: seeds since to current time', async () => {
    axiosGetMock.mockResolvedValue(pageResp([]));
    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(0);
    expect(setSinceMock).toHaveBeenCalledWith('sonarr', new Date(NOW).toISOString());
    expect(setSinceMock).toHaveBeenCalledWith('radarr', new Date(NOW).toISOString());
  });

  // ── steady-state fetch + enqueue (C-IDENTITY) ──

  it('steady state: enqueues sonarr imports oldest-first; canonical shape; traceId pattern', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(103, '2025-01-14T12:00:00.000Z', 5, 53, 1, 3),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 5, 52, 1, 2),
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(3);
    expect(enqueueMock).toHaveBeenCalledTimes(3);
    expect(enqueueMock.mock.calls[0][0]).toMatchObject({
      source: 'sonarr', seriesId: 5, episodeId: 51, seasonNumber: 1, episodeNumber: 1,
      _viaReconcile: true,
    });
    expect(enqueueMock.mock.calls[1][0]).toMatchObject({ episodeId: 52 });
    expect(enqueueMock.mock.calls[2][0]).toMatchObject({ episodeId: 53 });
    expect(enqueueMock.mock.calls[0][0].traceId).toMatch(/^recon-[0-9a-f]+$/);
    expect(typeof enqueueMock.mock.calls[0][0]._receivedAt).toBe('string');
  });

  it('canonical sonarr identityKey matches live webhook shape', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 42, 7, 1, 1),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    await reconciler.reconcile({ now: NOW });
    const item = enqueueMock.mock.calls[0][0];
    expect(queue.identityKey(item)).toBe('sonarr:42:eid:7');
  });

  it('canonical radarr identityKey matches live shape', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([]));
    axiosGetMock.mockResolvedValueOnce(pageResp([
      radarrHistoryRecord(201, '2025-01-12T12:00:00.000Z', 99),
    ]));

    await reconciler.reconcile({ now: NOW });
    const item = enqueueMock.mock.calls[0][0];
    expect(item).toMatchObject({ source: 'radarr', movieId: 99, _viaReconcile: true });
    expect(queue.identityKey(item)).toBe('radarr:99');
  });

  // ── ledger dedup (C-LEDGER) ──

  it('ledger dedup: items already in sentKeys are skipped', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: ['sonarr:5:eid:51'] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    isSentMock.mockImplementation((source, key) =>
      source === 'sonarr' && key === 'sonarr:5:eid:51');
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 5, 52, 1, 2),
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(1);
    expect(enqueueMock.mock.calls[0][0]).toMatchObject({ episodeId: 52 });
  });

  // ── CAP_PER_RUN + remainder (WR-5) ──

  it('CAP_PER_RUN=25: takes oldest 25; setSince advances only to newest TAKEN (remainder re-fetched next tick)', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2024-12-31T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2024-12-31T00:00:00.000Z', sentKeys: [] },
    });
    const records = [];
    for (let i = 30; i >= 1; i -= 1) {
      records.push(sonarrHistoryRecord(
        100 + i,
        new Date(`2025-01-${String(i).padStart(2, '0')}T00:00:00.000Z`).toISOString(),
        5, 50 + i, 1, i,
      ));
    }
    axiosGetMock.mockResolvedValueOnce(pageResp(records));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(25);
    expect(enqueueMock.mock.calls[0][0].episodeId).toBe(51);  // Jan 1
    expect(enqueueMock.mock.calls[24][0].episodeId).toBe(75); // Jan 25
    expect(setSinceMock).toHaveBeenCalledWith('sonarr',
      new Date('2025-01-25T00:00:00.000Z').toISOString());
  });

  // ── blacklist gate (F-6) ──

  it('blacklist by id: matching items skipped', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    isIdBlMock.mockImplementation((type, id) => type === 'sonarr' && id === 5);
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 7, 71, 1, 1),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(1);
    expect(enqueueMock.mock.calls[0][0].seriesId).toBe(7);
  });

  it('blacklist by path: matching prefix items skipped', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    isPathBlMock.mockImplementation((type, p) => type === 'sonarr' && p.startsWith('/tv/series-5'));
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1, { path: '/tv/series-5' }),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 7, 71, 1, 1, { path: '/tv/series-7' }),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(1);
    expect(enqueueMock.mock.calls[0][0].seriesId).toBe(7);
  });

  // ── fail-soft (WR-13) ──

  it('sonarr error is fail-soft: radarr still processes', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockImplementation(async (url) => {
      if (url.includes('sonarr.test')) throw new Error('sonarr down');
      if (url.includes('radarr.test')) return pageResp([
        radarrHistoryRecord(201, '2025-01-12T12:00:00.000Z', 99),
      ]);
      return pageResp([]);
    });

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(1);
    expect(enqueueMock.mock.calls[0][0]).toMatchObject({ source: 'radarr', movieId: 99 });
  });

  // ── safety margin / since boundary ──

  it('safety margin: records older than (since - 5min) are filtered out', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T12:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T12:00:00.000Z', sentKeys: [] },
    });
    // fetchSince = 2025-01-10T11:55:00Z (since - 5 min).
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-10T11:00:00.000Z', 5, 51, 1, 1),  // OLDER than margin — out
      sonarrHistoryRecord(102, '2025-01-10T11:58:00.000Z', 5, 52, 1, 2),  // INSIDE margin — in
      sonarrHistoryRecord(103, '2025-01-11T00:00:00.000Z', 5, 53, 1, 3),  // NEWER — in
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(2);
    const ids = enqueueMock.mock.calls.map((c) => c[0].episodeId).sort((a, b) => a - b);
    expect(ids).toEqual([52, 53]);
  });

  // ── unconfigured source ──

  it('unconfigured *arr (no baseUrl/apiKey) is skipped — no API call', async () => {
    config.sonarr = { baseUrl: '', apiKey: '' };
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockResolvedValue(pageResp([]));

    await reconciler.reconcile({ now: NOW });

    const sonarrCalls = axiosGetMock.mock.calls.filter((c) => c[0].includes('sonarr.test'));
    expect(sonarrCalls.length).toBe(0);
  });

  // ── non-import eventType filter ──

  it('non-import eventTypes (grabbed/deleted) are filtered out client-side', async () => {
    getStateMock.mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1, { eventType: 'grabbed' }),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 5, 52, 1, 2, { eventType: 'episodeFileDeleted' }),
      sonarrHistoryRecord(103, '2025-01-14T12:00:00.000Z', 5, 53, 1, 3, { eventType: 'downloadFolderImported' }),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });
    expect(result.enqueued).toBe(1);
    expect(enqueueMock.mock.calls[0][0].episodeId).toBe(53);
  });
});

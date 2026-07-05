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

function sonarrHistoryRecord(id, dateIso, seriesId, episodeId, season, episode) {
  return {
    id,
    eventType: 'downloadFolderImported',
    date: dateIso,
    seriesId,
    episodeId,
    episode: { seasonNumber: season, episodeNumber: episode },
    series: { id: seriesId, path: `/tv/series-${seriesId}` },
  };
}

const pageResp = (records) => ({ data: { records } });

describe('reconciler cursor guard on partial-batch failure (FA-38)', () => {
  let origSonarr, origRadarr;
  let setSinceMock, enqueueMock, axiosGetMock;

  beforeEach(() => {
    origSonarr = config.sonarr;
    origRadarr = config.radarr;
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'sk' };
    config.radarr = { baseUrl: 'http://radarr.test', apiKey: 'rk' };
    vi.spyOn(reconcileState, 'getState').mockReturnValue({
      sonarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
      radarr: { since: '2025-01-10T00:00:00.000Z', sentKeys: [] },
    });
    setSinceMock = vi.spyOn(reconcileState, 'setSince').mockImplementation(() => {});
    vi.spyOn(reconcileState, 'isSent').mockReturnValue(false);
    vi.spyOn(reconcileState, 'recordSent').mockImplementation(() => {});
    vi.spyOn(blacklist, 'isIdBlacklisted').mockReturnValue(false);
    vi.spyOn(blacklist, 'isPathBlacklisted').mockReturnValue(false);
    enqueueMock = vi.spyOn(queue, 'enqueue').mockResolvedValue(true);
    axiosGetMock = vi.spyOn(axios, 'get').mockResolvedValue(pageResp([]));
  });

  afterEach(() => {
    config.sonarr = origSonarr;
    config.radarr = origRadarr;
    vi.restoreAllMocks();
  });

  it('older-fail + newer-success: cursor does not advance past the failed record', async () => {
    enqueueMock.mockImplementation(async (item) => {
      if (item.episodeId === 51) throw new Error('dispatch failed');
      return true;
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 5, 52, 1, 2),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(1);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    const sonarrSetSince = setSinceMock.mock.calls.filter((c) => c[0] === 'sonarr');
    expect(sonarrSetSince.length).toBe(0);
  });

  it('earlier-success + fail + later-success: cursor advances only to the last success before the failure', async () => {
    enqueueMock.mockImplementation(async (item) => {
      if (item.episodeId === 51) throw new Error('dispatch failed');
      return true;
    });
    axiosGetMock.mockResolvedValueOnce(pageResp([
      sonarrHistoryRecord(100, '2025-01-11T12:00:00.000Z', 5, 50, 1, 0),
      sonarrHistoryRecord(101, '2025-01-12T12:00:00.000Z', 5, 51, 1, 1),
      sonarrHistoryRecord(102, '2025-01-13T12:00:00.000Z', 5, 52, 1, 2),
    ]));
    axiosGetMock.mockResolvedValueOnce(pageResp([]));

    const result = await reconciler.reconcile({ now: NOW });

    expect(result.enqueued).toBe(2);
    const sonarrSetSince = setSinceMock.mock.calls.filter((c) => c[0] === 'sonarr');
    expect(sonarrSetSince.length).toBe(1);
    expect(sonarrSetSince[0][1]).toBe('2025-01-11T12:00:00.000Z');
  });
});

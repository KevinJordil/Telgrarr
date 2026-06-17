import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

// House pattern (see connection-tester.test.js): load axios + the unit via the
// SAME native require, then vi.spyOn the shared axios singleton that tmdb.js's
// CJS require('axios') holds. vi.mock('axios') does NOT intercept that require.
const require = createRequire(import.meta.url);
const axios = require('axios');
const { getTmdbSeriesById } = require('../src/tmdb.js');

describe('getTmdbSeriesById (P4.1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null without calling axios for a falsy id', async () => {
    const spy = vi.spyOn(axios, 'get');
    expect(await getTmdbSeriesById(null)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches /3/tv/{id} and returns res.data on success', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { id: 1399, overview: 'Noble families vie for the throne.' } });
    const r = await getTmdbSeriesById(1399, 'en-US');
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(axios.get.mock.calls[0][0]).toContain('/3/tv/1399');
    expect(r.overview).toContain('Noble families');
  });

  it('returns null (never throws) on axios error — R10 enrichment exception', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed status 401'));
    expect(await getTmdbSeriesById(1399)).toBeNull();
  });
});

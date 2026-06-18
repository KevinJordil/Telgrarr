import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../src/config.js', { tmdb: { apiKey: 'k' }, omdb: { apiKey: 'k' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
const axios = require('axios');
const { getTmdbMovieById, getTmdbSeriesById } = require('../src/tmdb.js');
const { getOmdbById } = require('../src/omdb.js');
const breaker = require('../src/services/provider-breaker.js');

const tmdb401 = () => { const e = new Error('401'); e.response = { status: 401, data: { status_code: 7 } }; return e; };

describe('P6.1a-3 — provider-breaker wired into the live fetchers', () => {
  beforeEach(() => breaker.reset());
  afterEach(() => vi.restoreAllMocks());

  it('TMDb 401 trips the breaker and short-circuits the next call', async () => {
    const spy = vi.spyOn(axios, 'get').mockRejectedValue(tmdb401());
    expect(await getTmdbMovieById(123)).toBeNull();
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await getTmdbMovieById(456)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reset() clears the trip', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(tmdb401());
    await getTmdbMovieById(123);
    expect(breaker.isTripped('tmdb')).toBe(true);
    breaker.reset();
    expect(breaker.isTripped('tmdb')).toBe(false);
  });

  it('TMDb non-auth (500) does NOT trip', async () => {
    const e = new Error('500'); e.response = { status: 500 };
    vi.spyOn(axios, 'get').mockRejectedValue(e);
    expect(await getTmdbMovieById(123)).toBeNull();
    expect(breaker.isTripped('tmdb')).toBe(false);
  });

  it('series fetch shares the tmdb trip and is gated', async () => {
    const spy = vi.spyOn(axios, 'get').mockRejectedValue(tmdb401());
    await getTmdbSeriesById(123);
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(await getTmdbSeriesById(456)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('OMDb invalid-key trips; not-found does NOT', async () => {
    const spy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { Response: 'False', Error: 'Invalid API key!' }, status: 200 });
    expect(await getOmdbById('tt1')).toBeNull();
    expect(breaker.isTripped('omdb')).toBe(true);
    breaker.reset();
    spy.mockResolvedValue({ data: { Response: 'False', Error: 'Movie not found!' }, status: 200 });
    expect(await getOmdbById('tt2')).toBeNull();
    expect(breaker.isTripped('omdb')).toBe(false);
  });

  it('OMDb gate short-circuits after trip', async () => {
    const spy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { Response: 'False', Error: 'Invalid API key!' }, status: 200 });
    await getOmdbById('tt1');
    expect(breaker.isTripped('omdb')).toBe(true);
    await getOmdbById('tt2');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

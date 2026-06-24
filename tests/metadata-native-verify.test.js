import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let translations = null, detailOverview = '';
stub('../src/config.js', { tmdb: { apiKey: 'k' }, omdb: {}, translator: { targetLang: 'es' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async () => {} });
stub('../src/sonarr.js', { getSeriesById: async () => ({ title: 'S', tmdbId: 55, genres: [] }) });
stub('../src/radarr.js', { getMovieById: async () => ({ title: 'M', tmdbId: 66, genres: [] }) });
stub('../src/omdb.js', { getOmdbById: async () => null });
stub('../src/tmdb.js', {
  getTmdbSeriesById: async () => ({ overview: detailOverview }),
  getTmdbMovieById: async () => ({ overview: detailOverview }),
  getTmdbTranslations: async () => translations,
});
const { fetchSonarrMetadata, fetchRadarrMetadata } = require('../src/services/metadata.js');

describe('OPEN-1 metadata native verification (provenance via /translations)', () => {
  beforeEach(() => { translations = null; detailOverview = ''; });
  it('Sonarr: English fallback (no es translation) -> _overviewNative:false', async () => {
    detailOverview = 'English fallback text.';
    translations = [{ iso_639_1: 'en', data: { overview: 'English fallback text.' } }];
    const { tmdbSeries } = await fetchSonarrMetadata('x', 'default_ar', true);
    expect(tmdbSeries._overviewNative).toBe(false);
  });
  it('Sonarr: genuine native es -> no flag', async () => {
    detailOverview = 'Texto en espanol.';
    translations = [{ iso_639_1: 'es', data: { overview: 'Texto en espanol.' } }];
    const { tmdbSeries } = await fetchSonarrMetadata('x', 'default_ar', true);
    expect(tmdbSeries._overviewNative).toBeUndefined();
  });
  it('Sonarr: /translations unavailable -> no flag (fail-safe trust)', async () => {
    detailOverview = 'Some text.';
    translations = null;
    const { tmdbSeries } = await fetchSonarrMetadata('x', 'default_ar', true);
    expect(tmdbSeries._overviewNative).toBeUndefined();
  });
  it('Radarr: English fallback -> _overviewNative:false', async () => {
    detailOverview = 'English fallback text.';
    translations = [{ iso_639_1: 'en', data: { overview: 'English fallback text.' } }];
    const { tmdbMovie } = await fetchRadarrMetadata('y', 'default_ar', true);
    expect(tmdbMovie._overviewNative).toBe(false);
  });
});

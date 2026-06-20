import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let keys = [], langs = [];
stub('../src/config.js', { tmdb: { language: 'zz-ZZ' }, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {}, omdb: { apiKey: '' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/sonarr.js', { getSeriesById: async () => ({ title: 'S', tmdbId: 99, imdbId: 'tt1' }) });
stub('../src/radarr.js', { getMovieById: async () => ({ title: 'M', tmdbId: 42, imdbId: 'tt2', ratings: {} }) });
stub('../src/tmdb.js', { getTmdbSeriesById: async (i, l) => { langs.push(l); return { overview: 'o' }; }, getTmdbMovieById: async (i, l) => { langs.push(l); return { overview: 'o' }; } });
stub('../src/omdb.js', { getOmdbById: async () => null });
stub('../src/media-cache.js', { get: async (k) => { keys.push(k); return null; }, set: async (k) => { keys.push(k); } });
const { fetchSonarrMetadata, fetchRadarrMetadata } = require('../src/services/metadata.js');

describe('P5.4 — TMDb fetch locale = target; cache keyed by locale', () => {
  beforeEach(() => { keys = []; langs = []; });
  it('Sonarr non-EN fetches+keys TMDb in targetLang (ar), abandons tmdb.language', async () => {
    await fetchSonarrMetadata(1, 'default_ar');
    expect(langs).toContain('ar');
    expect(keys).toContain('tmdb-tv:99:ar');
    expect(keys.some((k) => k.includes('zz-ZZ'))).toBe(false);
  });
  it('Sonarr EN fetches+keys TMDb in en-US', async () => {
    await fetchSonarrMetadata(1, 'default_en');
    expect(langs).toContain('en-US');
    expect(keys).toContain('tmdb-tv:99:en-US');
  });
  it('Radarr non-EN fetches+keys TMDb in targetLang (ar)', async () => {
    await fetchRadarrMetadata(1, 'default_ar');
    expect(langs).toContain('ar');
    expect(keys).toContain('radarr:42:ar');
  });
});

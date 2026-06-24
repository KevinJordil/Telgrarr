import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let optsCalls = [];
stub('../src/config.js', { tmdb: { language: 'en-US' }, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async () => {} });
stub('../src/translator.js', { translateText: async (t, o) => { optsCalls.push(o); return 'XLATED'; }, aiWatermark: (l) => `[WM:${l}]` });
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

describe('OPEN-1 fallback flag — _overviewNative:false forces translate+watermark', () => {
  beforeEach(() => { optsCalls = []; });
  it('Sonarr es: TMDb overview flagged fallback -> translated + watermarked', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, { overview: 'English fallback.', _overviewNative: false }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(1);
    expect(optsCalls[0].targetLang).toBe('es');
    expect(s._overviewAr).toBe('XLATED[WM:es]');
  });
  it('Sonarr es: genuinely native (no flag) -> NOT translated', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, { overview: 'Trama nativa.' }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(0);
    expect(s._overviewAr).toBe('Trama nativa.');
  });
  it('Radarr es: TMDb overview flagged fallback -> translated + watermarked', async () => {
    const { tmdbMovie } = await enrichRadarrMedia({ title: 'M', tmdbId: 2, genres: [] }, { overview: 'English fallback.', _overviewNative: false }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(1);
    expect(optsCalls[0].targetLang).toBe('es');
    expect(tmdbMovie._overviewAr).toBe('XLATED[WM:es]');
  });
  it('Radarr es: genuinely native (no flag) -> NOT translated', async () => {
    const { tmdbMovie } = await enrichRadarrMedia({ title: 'M', tmdbId: 2, genres: [] }, { overview: 'Trama nativa.' }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(0);
    expect(tmdbMovie._overviewAr).toBe('Trama nativa.');
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
stub('../src/config.js', { tmdb: {}, translator: { targetLang: 'ar' }, sonarr: { includePlot: true }, radarr: { includePlot: true }, omdb: { apiKey: '' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async () => {} });
stub('../src/translator.js', { translateText: async () => 'X', aiWatermark: () => '' });
const { enrichRadarrMedia } = require('../src/services/media-enricher.js');

describe('P6.1b — Radarr genres capped to 2 (Sonarr parity, anti-spam)', () => {
  it('caps _genresEn to 2 when more than 2 genres are present', async () => {
    const { movie } = await enrichRadarrMedia({ title: 'M', genres: ['Action', 'Drama', 'Comedy', 'Thriller'], ratings: {} }, null, null, 'default_en');
    expect(movie._genresEn.split(' \u2022 ').length).toBe(2);
  });
  it('leaves <=2 genres unchanged', async () => {
    const { movie } = await enrichRadarrMedia({ title: 'M', genres: ['Action'], ratings: {} }, null, null, 'default_en');
    expect(movie._genresEn).toBe('Action');
  });
});

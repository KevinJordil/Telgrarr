import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let keys = [];
stub('../src/config.js', { tmdb: { language: 'en-US' }, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async (k) => { keys.push(k); return null; }, set: async (k) => { keys.push(k); } });
stub('../src/translator.js', { translateText: async () => 'XLATED', aiWatermark: (l) => `[WM:${l}]` });
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

describe('P5.3 — enrichers key by translator.targetLang, not tmdb.language', () => {
  beforeEach(() => { keys = []; });
  it('Sonarr plot+genre keys carry targetLang (ar), not tmdb.language (en-US)', async () => {
    await enrichSonarrMedia({ title: 'S', tmdbId: 99, overview: 'A plot.', genres: ['Cyberpunk'] }, null, null, 'default_ar');
    expect(keys).toContain('plot:tv:99:ar');
    expect(keys.some((k) => k.startsWith('genre:') && k.endsWith(':ar'))).toBe(true);
    expect(keys.some((k) => k.includes('en-US'))).toBe(false);
  });
  it('Radarr plot key carries targetLang (ar)', async () => {
    await enrichRadarrMedia({ title: 'M', tmdbId: 42, overview: 'A plot.', genres: ['Cyberpunk'] }, null, null, 'default_ar');
    expect(keys).toContain('plot:42:ar');
    expect(keys.some((k) => k.includes('en-US'))).toBe(false);
  });
  it('watermark is requested for the target language', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 7, overview: 'Plot text.', genres: [] }, null, null, 'default_ar');
    expect(s._overviewAr).toContain('[WM:ar]');
  });
});

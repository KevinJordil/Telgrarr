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

describe('B1-PLOT — plot translateText receives the resolved targetLang', () => {
  beforeEach(() => { optsCalls = []; });

  it('Sonarr plot: langOverride fr forwards targetLang:fr', async () => {
    await enrichSonarrMedia({ title: 'S', tmdbId: 99, overview: 'A plot.', genres: [] }, null, null, 'default_ar', 'fr');
    expect(optsCalls.length).toBeGreaterThan(0);
    expect(optsCalls.every((o) => o && o.targetLang === 'fr')).toBe(true);
  });

  it('Radarr plot: langOverride fr forwards targetLang:fr', async () => {
    await enrichRadarrMedia({ title: 'M', tmdbId: 42, overview: 'A plot.', genres: [] }, null, null, 'default_ar', 'fr');
    expect(optsCalls.length).toBeGreaterThan(0);
    expect(optsCalls.every((o) => o && o.targetLang === 'fr')).toBe(true);
  });

  it('ar parity: default (no override) forwards targetLang:ar (== old implicit default)', async () => {
    await enrichSonarrMedia({ title: 'S', tmdbId: 7, overview: 'Plot text.', genres: [] }, null, null, 'default_ar');
    expect(optsCalls.length).toBeGreaterThan(0);
    expect(optsCalls.every((o) => o && o.targetLang === 'ar')).toBe(true);
  });
});

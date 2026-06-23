import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }
let optsCalls = [];
let xlatedReturn = 'XLATED';
stub('../src/config.js', { tmdb: { language: 'en-US' }, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async () => {} });
stub('../src/translator.js', { translateText: async (t, o) => { optsCalls.push(o); return xlatedReturn; }, aiWatermark: (l) => `[WM:${l}]` });
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');
const AR_PLOT = '\u0642\u0635\u0629 \u0639\u0631\u0628\u064a\u0629'; // never retype the glyph (QB-5/6)

describe('OPEN-1 — native-first plot language (provenance-by-source)', () => {
  beforeEach(() => { optsCalls = []; xlatedReturn = 'XLATED'; });

  it('Sonarr es: TMDb-native plot — NOT translated, NOT watermarked', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, { overview: 'Una trama nativa.' }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(0);
    expect(s._overviewAr).toBe('Una trama nativa.');
  });
  it('Sonarr es: English OMDb plot — translated to es + watermarked [B1]', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, null, { Plot: 'An English plot.' }, 'default_ar', 'es');
    expect(optsCalls.length).toBe(1);
    expect(optsCalls[0].targetLang).toBe('es');
    expect(s._overviewAr).toBe('XLATED[WM:es]');
  });
  it('Sonarr ar: native Arabic plot — byte-identical, no translate/stamp', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, { overview: AR_PLOT }, null, 'default_ar');
    expect(optsCalls.length).toBe(0);
    expect(s._overviewAr).toBe(AR_PLOT);
  });
  it('Sonarr ar: English source still translates + stamps [WM:ar]', async () => {
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, null, { Plot: 'An English plot.' }, 'default_ar');
    expect(optsCalls.length).toBe(1);
    expect(optsCalls[0].targetLang).toBe('ar');
    expect(s._overviewAr).toBe('XLATED[WM:ar]');
  });
  it('Sonarr es: translator degradation (null) — passthrough, NO watermark', async () => {
    xlatedReturn = null;
    const s = await enrichSonarrMedia({ title: 'S', tmdbId: 1, genres: [] }, null, { Plot: 'An English plot.' }, 'default_ar', 'es');
    expect(optsCalls.length).toBe(1);
    expect(s._overviewAr).toBe('An English plot.');
  });

  it('Radarr es: TMDb-native plot — NOT translated, NOT watermarked', async () => {
    const { tmdbMovie } = await enrichRadarrMedia({ title: 'M', tmdbId: 2, genres: [] }, { overview: 'Una trama nativa.' }, null, 'default_ar', 'es');
    expect(optsCalls.length).toBe(0);
    expect(tmdbMovie._overviewAr).toBe('Una trama nativa.');
  });
  it('Radarr es: English OMDb plot — translated to es + watermarked [B1]', async () => {
    const { tmdbMovie } = await enrichRadarrMedia({ title: 'M', tmdbId: 2, genres: [] }, null, { Plot: 'An English plot.' }, 'default_ar', 'es');
    expect(optsCalls.length).toBe(1);
    expect(optsCalls[0].targetLang).toBe('es');
    expect(tmdbMovie._overviewAr).toBe('XLATED[WM:es]');
  });
  it('Radarr ar: native Arabic plot — byte-identical, no translate/stamp', async () => {
    const { tmdbMovie } = await enrichRadarrMedia({ title: 'M', tmdbId: 2, genres: [] }, { overview: AR_PLOT }, null, 'default_ar');
    expect(optsCalls.length).toBe(0);
    expect(tmdbMovie._overviewAr).toBe(AR_PLOT);
  });
});

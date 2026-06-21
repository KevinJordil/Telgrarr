import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }

let calls = [];
let cacheSet = [];
let cacheStore = {};
stub('../src/config.js', { tmdb: {}, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', {
  get: async (k) => (Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null),
  set: async (k, v) => { cacheSet.push(k); cacheStore[k] = v; },
});
stub('../src/translator.js', { translateText: async (t, o) => { calls.push({ text: t, opts: o }); return 'XL-' + (o && o.targetLang) + '-' + t; }, aiWatermark: (l) => `[WM:${l}]` });
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');
const { translateGenres } = require('../src/genres.js');
const AR = /[\u0600-\u06FF]/;

describe('B1-GENRE — non-ar genres render in targetLang (cache->AI); ar branch frozen', () => {
  beforeEach(() => { calls = []; cacheSet = []; cacheStore = {}; });

  it('Sonarr fr: KNOWN genre is translated to fr (not the Arabic static map) and cached', async () => {
    const s = await enrichSonarrMedia({ title: 'S', genres: ['Action'] }, null, null, 'default_ar', 'fr');
    expect(calls.some(c => c.text === 'Action' && c.opts && c.opts.targetLang === 'fr')).toBe(true);
    expect(s._genresAr).toContain('XL-fr-Action');
    expect(AR.test(s._genresAr)).toBe(false);
    expect(cacheSet).toContain('genre:action:fr');
  });

  it('Sonarr fr: second render hits cache, no re-translate (no key burn)', async () => {
    await enrichSonarrMedia({ title: 'S', genres: ['Action'] }, null, null, 'default_ar', 'fr');
    calls = [];
    const s2 = await enrichSonarrMedia({ title: 'S', genres: ['Action'] }, null, null, 'default_ar', 'fr');
    expect(calls).toEqual([]);
    expect(s2._genresAr).toContain('XL-fr-Action');
  });

  it('Radarr fr: KNOWN genre translated to fr (no Arabic leak)', async () => {
    const r = await enrichRadarrMedia({ title: 'M', genres: ['Action'] }, null, null, 'default_ar', 'fr');
    expect(r.movie._genresAr).toContain('XL-fr-Action');
    expect(AR.test(r.movie._genresAr)).toBe(false);
  });

  it('ar parity: KNOWN genre uses the static AR map, NO translateText (source-derived oracle)', async () => {
    const s = await enrichSonarrMedia({ title: 'S', genres: ['Action'] }, null, null, 'default_ar');
    expect(calls).toEqual([]);
    expect(s._genresAr).toBe(translateGenres(['Action']).join(' \u2022 '));
  });
});

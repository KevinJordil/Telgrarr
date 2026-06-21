import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }

let setKeys = [];
let calls = [];
let store = {};
stub('../src/config.js', { tmdb: {}, translator: { targetLang: 'ar' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', {
  get: async (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  set: async (k, v) => { setKeys.push(k); store[k] = v; },
});
stub('../src/translator.js', { translateText: async (t) => { calls.push(t); return 'AR-' + t; }, aiWatermark: () => '' });
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');
const sonarr = (ov, extra = {}) => ({ title: 'S', overview: ov, genres: [], ...extra });

describe('B1-CACHE — plot key = hash(source)+lang (cacheable w/o tmdbId, source-invalidating)', () => {
  beforeEach(() => { setKeys = []; calls = []; store = {}; });

  it('no-tmdbId source is BOTH translated and cached (fixes key-burn + untranslated-plot leak)', async () => {
    const s = await enrichSonarrMedia(sonarr('A foreign plot.'), null, null, 'default_ar', 'fr');
    expect(calls).toContain('A foreign plot.');
    expect(s._overviewAr).toContain('AR-A foreign plot.');
    expect(setKeys.some((k) => k.startsWith('plot:tv:') && k.endsWith(':fr'))).toBe(true);
  });

  it('same source re-render hits cache (no second translate)', async () => {
    await enrichSonarrMedia(sonarr('Stable plot.'), null, null, 'default_ar', 'fr');
    calls = [];
    await enrichSonarrMedia(sonarr('Stable plot.'), null, null, 'default_ar', 'fr');
    expect(calls).toEqual([]);
  });

  it('changed source => different key => re-translates (invalidation)', async () => {
    await enrichSonarrMedia(sonarr('Source one.'), null, null, 'default_ar', 'fr');
    calls = [];
    await enrichSonarrMedia(sonarr('Source two.'), null, null, 'default_ar', 'fr');
    expect(calls).toContain('Source two.');
  });

  it('key derives from source, not tmdbId (same overview, different tmdbId => same key)', async () => {
    await enrichSonarrMedia(sonarr('Same overview.', { tmdbId: 1 }), null, null, 'default_ar', 'fr');
    const plot1 = setKeys.find((k) => k.startsWith('plot:tv:'));
    setKeys = []; store = {};
    await enrichSonarrMedia(sonarr('Same overview.', { tmdbId: 2 }), null, null, 'default_ar', 'fr');
    const plot2 = setKeys.find((k) => k.startsWith('plot:tv:'));
    expect(plot1).toBe(plot2);
  });

  it('Radarr: same source-hash keying, translated + cacheable w/o tmdbId', async () => {
    const r = await enrichRadarrMedia({ title: 'M', overview: 'Movie plot.', genres: [] }, null, null, 'default_ar', 'fr');
    expect(calls).toContain('Movie plot.');
    expect(r.tmdbMovie._overviewAr).toContain('AR-Movie plot.');
    expect(setKeys.some((k) => k.startsWith('plot:') && !k.startsWith('plot:tv:') && k.endsWith(':fr'))).toBe(true);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }

let translateImpl = async () => null;
const setCalls = [];

stub('../src/config.js', { sonarr: {}, radarr: {}, translator: { targetLang: 'ar' }, tmdb: {}, omdb: { apiKey: '' } });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async (k, v) => { setCalls.push([k, v]); } });
stub('../src/translator.js', { translateText: async (...a) => translateImpl(...a), aiWatermark: () => '' });
stub('../src/genres.js', { translateGenres: (a) => a, translateStatus: () => '' });
stub('../src/utils/media-utils.js', { attachSeerr: (x) => x, resolveRating: () => null });

const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

const sonarrIn = () => [{ title: 'S', tmdbId: 555, genres: [], status: 'continuing', overview: 'An English plot.' }, null, null, 'default_ar'];
const radarrIn = () => [{ title: 'M', tmdbId: 777, genres: [], ratings: {} }, { overview: 'An English plot.' }, null, 'default_ar'];
const plotKeys = () => setCalls.map(c => c[0]).filter(k => k.startsWith('plot:'));

describe('P6.2 — translation failure must NOT be cached (the {fallback:null} guard)', () => {
  beforeEach(() => { setCalls.length = 0; });

  it('Sonarr: failed translation writes no plot cache', async () => {
    translateImpl = async () => null;
    await enrichSonarrMedia(...sonarrIn());
    expect(plotKeys()).toEqual([]);
  });
  it('Sonarr: successful translation writes the plot cache', async () => {
    translateImpl = async () => '\u0646\u0635 \u0639\u0631\u0628\u064a';
    await enrichSonarrMedia(...sonarrIn());
    expect(plotKeys()).toEqual(['plot:tv:555:ar']);
  });
  it('Radarr: failed translation writes no plot cache', async () => {
    translateImpl = async () => null;
    await enrichRadarrMedia(...radarrIn());
    expect(plotKeys()).toEqual([]);
  });
  it('Radarr: successful translation writes the plot cache', async () => {
    translateImpl = async () => '\u0646\u0635 \u0639\u0631\u0628\u064a';
    await enrichRadarrMedia(...radarrIn());
    expect(plotKeys()).toEqual(['plot:777:ar']);
  });
});

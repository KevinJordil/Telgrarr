import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
function stub(p, exports) { const id = require.resolve(p); require.cache[id] = { id, filename: id, loaded: true, exports }; }

let translateCalls = [];
stub('../src/config.js', { tmdb: { language: 'ar-SA' }, sonarr: {}, radarr: {} });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {} });
stub('../src/media-cache.js', { get: async () => null, set: async () => {} });
stub('../src/translator.js', { translateText: async (t) => { translateCalls.push(t); return 'XLATED-' + t; } });
// ../src/genres.js (real translateGenres/GENRE_MAP) and media-utils load for real.

const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

describe('Genre AI fallback parity (D1 — shared resolveGenresAr)', () => {
  beforeEach(() => { translateCalls = []; });

  it('Sonarr default_ar: MAPPED genre uses static map, NO translateText call', async () => {
    const s = await enrichSonarrMedia({ title: 'S', genres: ['Drama'] }, null, null, 'default_ar');
    expect(translateCalls).toEqual([]);
    expect(s._genresAr).toBeTruthy();
  });

  it('Sonarr default_ar: UNMAPPED genre falls back to AI (the D1 fix)', async () => {
    const s = await enrichSonarrMedia({ title: 'S', genres: ['Cyberpunk'] }, null, null, 'default_ar');
    expect(translateCalls).toContain('Cyberpunk');
    expect(s._genresAr).toContain('XLATED');
  });

  it('Sonarr default_en: no genre translation at all', async () => {
    await enrichSonarrMedia({ title: 'S', genres: ['Cyberpunk'] }, null, null, 'default_en');
    expect(translateCalls).toEqual([]);
  });

  it('Radarr parity preserved: MAPPED static (no AI), UNMAPPED AI', async () => {
    const a = await enrichRadarrMedia({ title: 'M', genres: ['Action'] }, null, null, 'default_ar');
    expect(translateCalls).toEqual([]);
    expect(a.movie._genresAr).toBeTruthy();
    const b = await enrichRadarrMedia({ title: 'M', genres: ['Cyberpunk'] }, null, null, 'default_ar');
    expect(translateCalls).toContain('Cyberpunk');
    expect(b.movie._genresAr).toContain('XLATED');
  });
});

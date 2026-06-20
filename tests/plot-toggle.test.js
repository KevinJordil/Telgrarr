import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { enrichRadarrMedia } = require('../src/services/media-enricher.js');
// P4.5: plot gating is the `plotEnabled` arg (plot layout element), passed by
// the caller — not config.radarr.includePlot. Default true preserves parity.
describe('Radarr plot toggle (P4.5 — plotEnabled arg)', () => {
  const movie = () => ({ title: 'X', imdbId: 'tt1', tmdbId: 1, overview: 'A plot.', ratings: {} });
  it('plotEnabled ON -> plot carried', async () => {
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_en', undefined, true);
    expect(tmdbMovie).not.toBeNull();
    expect(tmdbMovie._overviewEn).toBe('A plot.');
  });
  it('plotEnabled OFF -> no carrier, no plot', async () => {
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_en', undefined, false);
    expect(tmdbMovie).toBeNull();
  });
  it('plotEnabled OFF in AR mode -> translate never reached (offline)', async () => {
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_ar', undefined, false);
    expect(tmdbMovie).toBeNull();
  });
  it('plotEnabled OFF with TMDb present -> raw overview suppressed (no leak)', async () => {
    const tmdb = { overview: 'Raw TMDb plot.', genres: [], vote_average: 7 };
    const { tmdbMovie } = await enrichRadarrMedia(movie(), tmdb, null, 'default_ar', undefined, false);
    expect(tmdbMovie.overview || '').toBe('');
    expect(tmdbMovie._overviewAr ?? '').toBe('');
  });
});

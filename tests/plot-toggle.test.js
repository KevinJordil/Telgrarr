import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const { enrichRadarrMedia } = require('../src/services/media-enricher.js');

// P3.4: config.radarr.includePlot gates the plot cascade + OMDb-for-plot +
// translate. Default (undefined or true) = on, so existing behavior is parity.
describe('Radarr plot toggle (P3.4)', () => {
  let orig;
  beforeEach(() => { orig = config.radarr ? config.radarr.includePlot : undefined; });
  afterEach(() => { if (config.radarr) config.radarr.includePlot = orig; });

  const movie = () => ({ title: 'X', imdbId: 'tt1', tmdbId: 1, overview: 'A plot.', ratings: {} });

  it('includePlot ON -> plot carried', async () => {
    config.radarr.includePlot = true;
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_en');
    expect(tmdbMovie).not.toBeNull();
    expect(tmdbMovie._overviewEn).toBe('A plot.');
  });

  it('includePlot OFF -> no carrier, no plot', async () => {
    config.radarr.includePlot = false;
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_en');
    expect(tmdbMovie).toBeNull();
  });

  it('includePlot OFF in AR mode -> translate never reached (completes offline)', async () => {
    config.radarr.includePlot = false;
    const { tmdbMovie } = await enrichRadarrMedia(movie(), null, null, 'default_ar');
    expect(tmdbMovie).toBeNull();
  });

  it('includePlot OFF with TMDb present -> raw overview suppressed (no leak)', async () => {
    config.radarr.includePlot = false;
    const tmdb = { overview: 'Raw TMDb plot.', genres: [], vote_average: 7 };
    const { tmdbMovie } = await enrichRadarrMedia(movie(), tmdb, null, 'default_ar');
    expect(tmdbMovie.overview || '').toBe('');
    expect(tmdbMovie._overviewAr ?? '').toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { enrichRadarrMedia } = require('../src/services/media-enricher.js');

// Non-Arabic mode exercises the plot cascade + carrier without the translator,
// cache, or any network — pure, deterministic.
const MODE = 'default_en';

describe('Radarr plot fallback chain (P2)', () => {
  it('TMDb null + OMDb Plot -> carrier holds the OMDb plot', async () => {
    const movie = { title: 'X', imdbId: 'tt1', tmdbId: 1, ratings: {} };
    const { tmdbMovie } = await enrichRadarrMedia(movie, null, { Plot: 'From OMDb.' }, MODE);
    expect(tmdbMovie).not.toBeNull();
    expect(tmdbMovie._overviewEn).toBe('From OMDb.');
  });

  it('OMDb Plot "N/A" is ignored -> falls through to Radarr overview', async () => {
    const movie = { title: 'X', imdbId: 'tt1', tmdbId: 1, overview: 'From Radarr.', ratings: {} };
    const { tmdbMovie } = await enrichRadarrMedia(movie, null, { Plot: 'N/A' }, MODE);
    expect(tmdbMovie._overviewEn).toBe('From Radarr.');
  });

  it('TMDb null + OMDb null + Radarr overview -> carrier holds Radarr overview', async () => {
    const movie = { title: 'X', overview: 'Radarr only.', ratings: {} };
    const { tmdbMovie } = await enrichRadarrMedia(movie, null, null, MODE);
    expect(tmdbMovie._overviewEn).toBe('Radarr only.');
  });

  it('all-empty -> no carrier minted, no crash', async () => {
    const res = await enrichRadarrMedia({ title: 'X', ratings: {} }, null, null, MODE);
    expect(res.tmdbMovie).toBeNull();
    expect(res.movie).toBeDefined();
  });

  it('PARITY: TMDb overview wins over OMDb Plot (cascade order unchanged)', async () => {
    const tmdb = { overview: 'From TMDb.', genres: [], vote_average: 7 };
    const movie = { title: 'X', imdbId: 'tt1', tmdbId: 1, overview: 'From Radarr.', ratings: {} };
    const { tmdbMovie } = await enrichRadarrMedia(movie, tmdb, { Plot: 'From OMDb.' }, MODE);
    expect(tmdbMovie._overviewEn).toBe('From TMDb.');
  });
});

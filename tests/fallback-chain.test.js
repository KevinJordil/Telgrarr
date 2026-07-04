import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// BCS F-EXT1: isolate DATA_DIR/LOGS_DIR so config.js never reads the
// operator's live data/config.json -- confirmed via diagnostic that the live
// file's aiOnlyPlot:true was silently overriding this pure unit test's
// TMDb-wins-cascade assumption (JS default in config.js is false).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-fallback-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ } });

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

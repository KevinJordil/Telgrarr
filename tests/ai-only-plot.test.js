import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

const orig = config.translator ? config.translator.aiOnlyPlot : undefined;
afterEach(() => { if (config.translator) config.translator.aiOnlyPlot = orig; });

describe('AI-only plot (P2.4 / DEC-6)', () => {
  it('Radarr ON: sources OMDb (not TMDb) and clears raw TMDb overview (no render leak)', async () => {
    config.translator.aiOnlyPlot = true;
    const { tmdbMovie } = await enrichRadarrMedia(
      { title: 'M', genres: [], ratings: {} },
      { overview: 'TMDB PLOT', genres: [] },
      { Plot: 'OMDB PLOT' }, 'default_en');
    expect(tmdbMovie._overviewEn).toBe('OMDB PLOT');
    expect(tmdbMovie.overview).toBe('');
  });
  it('Radarr OFF: keeps the TMDb overview (parity)', async () => {
    config.translator.aiOnlyPlot = false;
    const { tmdbMovie } = await enrichRadarrMedia(
      { title: 'M', genres: [], ratings: {} },
      { overview: 'TMDB PLOT', genres: [] },
      { Plot: 'OMDB PLOT' }, 'default_en');
    expect(tmdbMovie._overviewEn).toBe('TMDB PLOT');
    expect(tmdbMovie.overview).toBe('TMDB PLOT');
  });
  it('Sonarr ON: sources OMDb, not the TMDb-TV overview', async () => {
    config.translator.aiOnlyPlot = true;
    const out = await enrichSonarrMedia(
      { title: 'S', genres: [], status: 'continuing', overview: 'SONARR OWN' },
      { overview: 'TMDB TV PLOT' }, { Plot: 'OMDB PLOT' }, 'default_en');
    expect(out._overviewEn).toBe('OMDB PLOT');
  });
  it('Sonarr OFF: uses the TMDb-TV overview (parity)', async () => {
    config.translator.aiOnlyPlot = false;
    const out = await enrichSonarrMedia(
      { title: 'S', genres: [], status: 'continuing', overview: 'SONARR OWN' },
      { overview: 'TMDB TV PLOT' }, { Plot: 'OMDB PLOT' }, 'default_en');
    expect(out._overviewEn).toBe('TMDB TV PLOT');
  });
});

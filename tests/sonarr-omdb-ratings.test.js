import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// ── Fixtures ──────────────────────────────────────────────────────────────────
const logStub = {
  info: () => {}, warn: () => {}, error: () => {},
  audit: () => {}, debug: () => {}, setLevel: () => {},
};

const SERIES_WITH_IMDB = { id: 1, tmdbId: 100, imdbId: 'tt1234567', title: 'Test Show' };
const SERIES_NO_IMDB   = { id: 2, tmdbId: 200, imdbId: null,        title: 'No IMDb Show' };
const TMDB_SERIES      = { id: 100, overview: 'A rich native overview.', vote_average: 8.5, backdrop_path: '/abc.jpg' };
const OMDB_DATA        = { imdbRating: '8.1', Ratings: [{ Source: 'Rotten Tomatoes', Value: '90%' }] };

function makeCacheStub(initial = {}) {
  const store = { ...initial };
  return {
    get: async (key) => store[key] ?? null,
    set: async (key, val) => { store[key] = val; },
  };
}

/**
 * Injects stubs into require.cache, then loads a fresh metadata.js.
 * omdbCalls is a shared array — each call to getOmdbById pushes the queried id.
 */
function buildAndLoad({
  omdbApiKey = 'OMDB_KEY',
  series     = SERIES_WITH_IMDB,
  cacheInitial = {},
} = {}) {
  delete require.cache[require.resolve('../src/services/metadata.js')];

  const cache    = makeCacheStub(cacheInitial);
  const omdbCalls = [];

  const stubs = [
    ['../src/logger.js',      logStub],
    ['../src/config.js',      {
      translator: { targetLang: 'ar', aiOnlyPlot: false },
      omdb:       { apiKey: omdbApiKey },
    }],
    ['../src/sonarr.js',      { getSeriesById: async () => series }],
    ['../src/radarr.js',      { getMovieById:  async () => null }],
    ['../src/tmdb.js',        {
      getTmdbSeriesById:    async () => TMDB_SERIES,
      getTmdbMovieById:     async () => null,
      getTmdbTranslations:  async () => [],
    }],
    ['../src/omdb.js',        { getOmdbById: async (id) => { omdbCalls.push(id); return OMDB_DATA; } }],
    ['../src/media-cache.js', cache],
  ];

  stubs.forEach(([mod, exp]) => {
    const id = require.resolve(mod);
    require.cache[id] = { id, filename: id, loaded: true, exports: exp };
  });

  return {
    metadata: require('../src/services/metadata.js'),
    omdbCalls,
    cache,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────
describe('H1.2 — Sonarr OMDb fetch broadened to (apiKey + imdbId)', () => {

  // ── Newly-unlocked paths (regression proof of HD-14A) ─────────────────────

  it('fetches OMDb when plotEnabled=true AND TMDb overview is present — was blocked pre-H1.2', async () => {
    // Pre-H1.2: `!(tmdbSeries && tmdbSeries.overview)` was false → OMDb skipped.
    // Post-H1.2: guard removed; OMDb always fires when apiKey + imdbId present.
    const { metadata, omdbCalls } = buildAndLoad();
    const result = await metadata.fetchSonarrMetadata(1, 'default', true);
    expect(omdbCalls).toHaveLength(1);
    expect(omdbCalls[0]).toBe('tt1234567');
    expect(result.omdbData).toEqual(OMDB_DATA);
  });

  it('fetches OMDb when plotEnabled=false — was blocked pre-H1.2 by `includePlot &&`', async () => {
    // Pre-H1.2: `includePlot=false` short-circuited the entire OMDb block.
    // Post-H1.2: plot gate removed; ratings fetch is independent of plot state.
    const { metadata, omdbCalls } = buildAndLoad();
    const result = await metadata.fetchSonarrMetadata(1, 'default', false);
    expect(omdbCalls).toHaveLength(1);
    expect(omdbCalls[0]).toBe('tt1234567');
    expect(result.omdbData).toEqual(OMDB_DATA);
  });

  // ── Guard conditions: OMDb must NOT fire ──────────────────────────────────

  it('skips OMDb when omdb.apiKey is empty string', async () => {
    const { metadata, omdbCalls } = buildAndLoad({ omdbApiKey: '' });
    await metadata.fetchSonarrMetadata(1, 'default', true);
    expect(omdbCalls).toHaveLength(0);
  });

  it('skips OMDb when omdb.apiKey is null (absent/not configured)', async () => {
    const { metadata, omdbCalls } = buildAndLoad({ omdbApiKey: null });
    await metadata.fetchSonarrMetadata(1, 'default', true);
    expect(omdbCalls).toHaveLength(0);
  });

  it('skips OMDb when series has no imdbId', async () => {
    const { metadata, omdbCalls } = buildAndLoad({ series: SERIES_NO_IMDB });
    await metadata.fetchSonarrMetadata(2, 'default', true);
    expect(omdbCalls).toHaveLength(0);
  });

  // ── Cache behaviour ───────────────────────────────────────────────────────

  it('uses cached OMDb response — API not called on cache hit', async () => {
    const { metadata, omdbCalls } = buildAndLoad({
      cacheInitial: { 'omdb:tt1234567': OMDB_DATA },
    });
    const result = await metadata.fetchSonarrMetadata(1, 'default', true);
    expect(omdbCalls).toHaveLength(0);
    expect(result.omdbData).toEqual(OMDB_DATA);
  });

  it('writes OMDb API result to cache on first fetch', async () => {
    const { metadata, cache } = buildAndLoad();
    await metadata.fetchSonarrMetadata(1, 'default', true);
    const cached = await cache.get('omdb:tt1234567');
    expect(cached).toEqual(OMDB_DATA);
  });

  // ── Return shape contract ─────────────────────────────────────────────────

  it('return shape { series, tmdbSeries, omdbData } is preserved — plotEnabled=true', async () => {
    const { metadata } = buildAndLoad();
    const result = await metadata.fetchSonarrMetadata(1, 'default', true);
    expect(result).toHaveProperty('series');
    expect(result).toHaveProperty('tmdbSeries');
    expect(result).toHaveProperty('omdbData');
    expect(result.series.id).toBe(1);
    expect(result.tmdbSeries).not.toBeNull();
    expect(result.omdbData).not.toBeNull();
  });

  it('tmdbSeries is null when plotEnabled=false (TMDb gate unchanged); omdbData is populated', async () => {
    // TMDb fetch is still guarded by `includePlot` — that path is unchanged.
    // Only the OMDb gate changed. The two are now independent.
    const { metadata } = buildAndLoad();
    const result = await metadata.fetchSonarrMetadata(1, 'default', false);
    expect(result.tmdbSeries).toBeNull();
    expect(result.omdbData).toEqual(OMDB_DATA);
  });
});

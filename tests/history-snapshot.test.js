/**
 * history-snapshot.test.js
 *
 * Verifies that the sweeper's Sonarr and Radarr write sites produce
 * fully-enriched dispatch snapshots (HIST H1.3) and that age-based
 * pruning fires in the sweep's finally block (HIST H1.5).
 *
 * Strategy: stub ALL sweeper dependencies; capture addHistory() argument;
 * assert the exact field shape for both sources and both data-availability
 * scenarios (full data / absent source data).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

// ── Static test fixtures ──────────────────────────────────────────────────────

const SONARR_QUEUE_ITEM = {
  source: 'sonarr', traceId: 'tr-abc', seriesId: 101,
  episodeId: 1001, seasonNumber: 2, episodeNumber: 5,
  episodeTitle: 'Fly', quality: 'HDTV-720p',
  _receivedAt: '2025-01-01T00:00:00.000Z',
};

const RADARR_QUEUE_ITEM = {
  source: 'radarr', traceId: 'tr-def', movieId: 603,
  quality: 'Bluray-1080p',
  _receivedAt: '2025-01-01T00:00:00.000Z',
};

const SERIES = {
  id: 101, title: 'Breaking Bad', year: 2008,
  imdbId: 'tt0903747', tmdbId: 1396, tvdbId: 81189,
  status: 'ended', genres: ['Drama', 'Crime'],
  overview: 'A chemistry teacher turns to crime.',
  images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/w500/bb.jpg' }],
};

const TMDB_SERIES = {
  id: 1396, overview: 'Walter White.', vote_average: 9.5,
  episode_run_time: [47], backdrop_path: '/bb_backdrop.jpg',
};

const OMDB_DATA = {
  imdbRating: '9.5',
  Plot: 'A teacher becomes a criminal.',
  Ratings: [
    { Source: 'Rotten Tomatoes', Value: '97%'    },
    { Source: 'Metacritic',      Value: '99/100' },
  ],
};

// Enriched series returned by enrichSonarrMedia stub (default/ar mode)
const ENRICHED_SERIES = {
  ...SERIES,
  _overviewAr: '\u0645\u062b\u0627\u0644 \u0639\u0631\u0628\u064a.',
  _overviewEn: 'A teacher becomes a criminal.',
  _genresAr:   '\u062f\u0631\u0627\u0645\u0627 \u2022 \u062c\u0631\u064a\u0645\u0629',
  _genresEn:   'Drama \u2022 Crime',
  _statusAr:   '\u0627\u0646\u062a\u0647\u0649',
  _statusEn:   'Ended',
};

const MOVIE = {
  id: 603, title: 'The Matrix', year: 1999,
  imdbId: 'tt0133093', tmdbId: 603,
  genres: ['Action', 'Science Fiction'],
  overview: 'A hacker discovers the truth.',
  images: [{ coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/w500/matrix.jpg' }],
  ratings: {
    imdb:           { value: 8.7 },
    tmdb:           { value: 8.2 },
    rottenTomatoes: { value: 83  },
    metacritic:     { value: 73  },
  },
};

const TMDB_MOVIE = {
  id: 603, runtime: 136, backdrop_path: '/matrix_backdrop.jpg',
  overview: 'A hacker discovers the truth.', vote_average: 8.2,
};

const ENRICHED_MOVIE = {
  ...MOVIE,
  _genresAr: '\u0623\u0643\u0634\u0646 \u2022 \u062e\u064a\u0627\u0644 \u0639\u0644\u0645\u064a',
  _genresEn: 'Action \u2022 Science Fiction',
};

const ENRICHED_TMDB_MOVIE = {
  ...TMDB_MOVIE,
  _overviewAr: '\u0646\u064a\u0648 \u064a\u0643\u062a\u0634\u0641 \u0627\u0644\u062d\u0642\u064a\u0642\u0629.',
  _overviewEn: 'A hacker discovers the truth.',
};

const ENRICHED_RATINGS = {
  imdb: '8.7', tmdb: '8.2', rottenTomatoes: '83', metacritic: '73',
};

const logStub = {
  info: () => {}, warn: () => {}, error: () => {},
  audit: () => {}, debug: () => {}, setLevel: () => {},
};

// ── Test lifecycle ────────────────────────────────────────────────────────────

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-snap-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── buildContext factory ──────────────────────────────────────────────────────

/**
 * Builds a stubbed sweeper context and returns { sweeper, getAddHistoryArg,
 * getPruneCalledWith }.
 *
 * @param {object} opts
 * @param {string}   [opts.activeMode='default']
 * @param {number}   [opts.maxAgeDays=0]
 * @param {object[]} [opts.sonarrItems]
 * @param {object[]} [opts.radarrItems]
 * @param {object}   [opts.enrichedSeries] — returned by enrichSonarrMedia stub
 * @param {object|null} [opts.tmdbSeries]
 * @param {object|null} [opts.omdbSonarr]
 * @param {object}   [opts.enrichedMovie]  — enrichRadarrMedia stub: movie
 * @param {object}   [opts.enrichedTmdbMovie] — enrichRadarrMedia stub: tmdbMovie
 * @param {object}   [opts.enrichedRatings]
 */
function buildContext(opts = {}) {
  const {
    activeMode       = 'default',
    maxAgeDays       = 0,
    sonarrItems      = [SONARR_QUEUE_ITEM],
    radarrItems      = [RADARR_QUEUE_ITEM],
    enrichedSeries   = ENRICHED_SERIES,
    tmdbSeries       = TMDB_SERIES,
    omdbSonarr       = OMDB_DATA,
    enrichedMovie    = ENRICHED_MOVIE,
    enrichedTmdbMovie = ENRICHED_TMDB_MOVIE,
    enrichedRatings  = ENRICHED_RATINGS,
  } = opts;

  delete require.cache[require.resolve('../src/sweeper.js')];

  let _addHistoryArg   = null;
  let _pruneCalledWith = null;

  // write-file-atomic stub: async callback + sync no-op
  const wfaStub = (file, data, cb) => { if (typeof cb === 'function') cb(null); };
  wfaStub.sync = () => {};

  const stubs = [
    ['../src/logger.js',      logStub],
    ['../src/config.js', {
      DATA_DIR:     tmpDir,
      batchWindowMs: 180000,
      history:      { maxItems: 500, maxAgeDays },
      translator:   { targetLang: 'ar', aiOnlyPlot: false },
      seerr:        { baseUrl: '' },
    }],
    ['write-file-atomic', wfaStub],
    ['../src/queue.js', {
      drainQueue:  async () => [...sonarrItems, ...radarrItems],
      enqueue:     async () => true,
      identityKey: (item) =>
        item.episodeId
          ? `sonarr-${item.seriesId}-${item.episodeId}`
          : (item.movieId ? `radarr-${item.movieId}` : null),
    }],
    ['../src/reconcile-state.js', { recordSent: () => {} }],
    ['../src/formatter.js', {
      buildCaption: async () => 'TEST_CAPTION',
      getPosterUrl: (s) =>
        (s.images || []).find(i => i.coverType === 'poster')?.remoteUrl || null,
    }],
    ['../src/radarr-formatter.js', {
      buildMovieCaption: () => ({ caption: 'TEST_CAPTION', pass: 1, length: 100 }),
      getPosterUrl: (m) =>
        (m.images || []).find(i => i.coverType === 'poster')?.remoteUrl || null,
    }],
    ['../src/emby.js', { refreshLibrary: async () => false }],
    ['../src/history.js', {
      addHistory:  async (items) => { _addHistoryArg = items; },
      pruneByAge:  async (days)  => { _pruneCalledWith = days; return 0; },
    }],
    ['../src/services/media-enricher.js', {
      enrichSonarrMedia: async () => enrichedSeries,
      enrichRadarrMedia: async () => ({
        movie:    enrichedMovie,
        tmdbMovie: { ...enrichedTmdbMovie },
        ratings:  enrichedRatings,
      }),
    }],
    ['../src/services/metadata.js', {
      fetchSonarrMetadata: async () => ({
        series:    { ...SERIES },
        tmdbSeries,
        omdbData:  omdbSonarr,
      }),
      fetchRadarrMetadata: async () => ({
        movie:    { ...MOVIE },
        tmdbMovie: { ...TMDB_MOVIE },
        omdbData:  OMDB_DATA,
      }),
    }],
    ['../src/services/notifications.js', {
      // Return ALL items as successful so addHistory receives the full array.
      dispatchBatch: async (_msgs, items) => ({ successful: items, failed: [] }),
    }],
    ['../src/templates.js', {
      getActiveMode:    () => activeMode,
      isElementEnabled: () => true,
      resolveTemplate:  () => 'DEFAULT_AR',
      getLayout:        () => ({ sonarr: null, radarr: null }),
    }],
    ['../src/events.js',                    { emit: () => {} }],
    ['../src/services/provider-breaker.js', { reset: () => {} }],
    // media-utils: use real resolveRating (pure fn; its config dependency
    // (attachSeerr) is not invoked in the history extraction code path).
  ];

  stubs.forEach(([mod, exp]) => {
    const id = require.resolve(mod);
    require.cache[id] = { id, filename: id, loaded: true, exports: exp };
  });

  return {
    sweeper:            require('../src/sweeper.js'),
    getAddHistoryArg:   () => _addHistoryArg,
    getPruneCalledWith: () => _pruneCalledWith,
  };
}

// ── Suite 1: Sonarr — full enriched data ────────────────────────────────────

describe('H1.3 Sonarr \u2014 enriched dispatch snapshot', () => {
  it('produces an enriched Sonarr history entry with all required fields', async () => {
    const { sweeper, getAddHistoryArg } = buildContext({ radarrItems: [] });
    await sweeper.runSweep();
    const entries = getAddHistoryArg();
    expect(entries).not.toBeNull();
    expect(entries).toHaveLength(1);
    const e = entries[0];

    // Core identity
    expect(e.type).toBe('show');
    expect(e.title).toBe('Breaking Bad');
    expect(e.year).toBe(2008);
    expect(e.id).toMatch(/^sonarr-101-\d+$/);
    expect(e.poster).toBe('https://image.tmdb.org/t/p/w500/bb.jpg');
    expect(e.details).toBe('1 Episode');
    expect(e.timestamp).toBeTruthy();
    expect(e.traces).toBe('tr-abc');

    // External IDs
    expect(e.imdbId).toBe('tt0903747');
    expect(e.tmdbId).toBe(1396);
    expect(e.tvdbId).toBe(81189);
    expect(e.language).toBe('ar');

    // Ratings (OMDb + TMDb vote_average — HD-14A)
    expect(e.ratings).toMatchObject({
      imdb:           '9.5',
      tmdb:           '9.5',
      rottenTomatoes: '97',
      metacritic:     '99',
    });

    // Overview and genres: Arabic path for default mode (HD-20)
    expect(e.overview).toBe(ENRICHED_SERIES._overviewAr);
    expect(e.genres).toBe(ENRICHED_SERIES._genresAr);

    // Runtime from episode_run_time[0]
    expect(e.runtime).toBe(47);

    // Quality from enqueued item (DECL-1A)
    expect(e.quality).toBe('HDTV-720p');

    // Backdrop URL (HD-17)
    expect(e.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/bb_backdrop.jpg');

    // Structured episode data (HD-18)
    expect(e.episodes).toHaveLength(1);
    expect(e.episodes[0]).toEqual({ season: 2, episode: 5, title: 'Fly' });

    // External IDs object (for detail modal links)
    expect(e.externalIds).toEqual({ tmdbId: 1396, imdbId: 'tt0903747', tvdbId: 81189 });
  });

  it('uses English overview and genres in default_en mode', async () => {
    const { sweeper, getAddHistoryArg } = buildContext({
      activeMode: 'default_en', radarrItems: [],
    });
    await sweeper.runSweep();
    const [e] = getAddHistoryArg();
    expect(e.overview).toBe(ENRICHED_SERIES._overviewEn);
    expect(e.genres).toBe(ENRICHED_SERIES._genresEn);
  });
});

// ── Suite 2: Radarr — full enriched data ────────────────────────────────────

describe('H1.3 Radarr \u2014 enriched dispatch snapshot', () => {
  it('produces an enriched Radarr history entry with all required fields', async () => {
    const { sweeper, getAddHistoryArg } = buildContext({ sonarrItems: [] });
    await sweeper.runSweep();
    const entries = getAddHistoryArg();
    expect(entries).not.toBeNull();
    expect(entries).toHaveLength(1);
    const e = entries[0];

    // Core identity
    expect(e.type).toBe('movie');
    expect(e.title).toBe('The Matrix');
    expect(e.year).toBe(1999);
    expect(e.id).toMatch(/^radarr-603-\d+$/);
    expect(e.details).toBe('136 min');
    expect(e.timestamp).toBeTruthy();

    // External IDs
    expect(e.imdbId).toBe('tt0133093');
    expect(e.tmdbId).toBe(603);
    expect(e.language).toBe('ar');

    // Ratings (from enrichRadarrMedia stub)
    expect(e.ratings).toMatchObject({
      imdb: '8.7', tmdb: '8.2', rottenTomatoes: '83', metacritic: '73',
    });

    // Overview: Arabic path (_overviewAr set via enriched tmdbMovie)
    expect(e.overview).toBe(ENRICHED_TMDB_MOVIE._overviewAr);

    // Genres: Arabic path (_genresAr from enrichedMovie)
    expect(e.genres).toBe(ENRICHED_MOVIE._genresAr);

    // Runtime as number (HD-19 numeric field)
    expect(e.runtime).toBe(136);

    // Quality from enqueued item (DECL-1A)
    expect(e.quality).toBe('Bluray-1080p');

    // Backdrop URL (HD-17)
    expect(e.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/matrix_backdrop.jpg');

    // Movies have no episode list
    expect(e.episodes).toBeNull();

    // External IDs object (tvdbId null for movies)
    expect(e.externalIds).toEqual({ tmdbId: 603, imdbId: 'tt0133093', tvdbId: null });
  });

  it('uses English overview and genres in default_en mode', async () => {
    const { sweeper, getAddHistoryArg } = buildContext({
      activeMode: 'default_en', sonarrItems: [],
    });
    await sweeper.runSweep();
    const [e] = getAddHistoryArg();
    expect(e.overview).toBe(ENRICHED_TMDB_MOVIE._overviewEn);
    expect(e.genres).toBe(ENRICHED_MOVIE._genresEn);
  });
});

// ── Suite 3: graceful null — absent source data ──────────────────────────────

describe('H1.3 graceful null \u2014 absent source data', () => {
  it('Sonarr: all nullable enriched fields are null when tmdbSeries and omdbData absent', async () => {
    const emptyEnriched = {
      ...SERIES,
      _overviewAr: null, _overviewEn: null,
      _genresAr: null,   _genresEn: null,
    };
    const { sweeper, getAddHistoryArg } = buildContext({
      radarrItems:    [],
      tmdbSeries:     null,
      omdbSonarr:     null,
      enrichedSeries: emptyEnriched,
    });
    await sweeper.runSweep();
    const [e] = getAddHistoryArg();

    expect(e.ratings.imdb).toBeNull();
    expect(e.ratings.tmdb).toBeNull();
    expect(e.ratings.rottenTomatoes).toBeNull();
    expect(e.ratings.metacritic).toBeNull();
    expect(e.overview).toBeNull();
    expect(e.genres).toBeNull();
    expect(e.runtime).toBeNull();
    expect(e.backdropUrl).toBeNull();
    // Quality and episode structure still come from queue items — never null
    expect(e.quality).toBe('HDTV-720p');
    expect(e.episodes[0]).toEqual({ season: 2, episode: 5, title: 'Fly' });
    // Core fields always present
    expect(e.title).toBe('Breaking Bad');
    expect(e.type).toBe('show');
    expect(e.id).toMatch(/^sonarr-101-\d+$/);
  });

  it('Sonarr: episodeTitle null when not enqueued (pre-DECL-1A queue item)', async () => {
    const legacyItem = { ...SONARR_QUEUE_ITEM, episodeTitle: undefined, quality: undefined };
    const emptyEnriched = { ...SERIES, _overviewAr: null, _overviewEn: null, _genresAr: null, _genresEn: null };
    const { sweeper, getAddHistoryArg } = buildContext({
      sonarrItems:    [legacyItem],
      radarrItems:    [],
      tmdbSeries:     null,
      omdbSonarr:     null,
      enrichedSeries: emptyEnriched,
    });
    await sweeper.runSweep();
    const [e] = getAddHistoryArg();
    expect(e.episodes[0].title).toBeNull();
    expect(e.quality).toBeNull();
  });
});

// ── Suite 4: H1.5 — age pruning fires in sweep finally ──────────────────────

describe('H1.5 integration \u2014 age pruning in sweep finally', () => {
  it('calls pruneByAge with maxAgeDays when > 0', async () => {
    const { sweeper, getPruneCalledWith } = buildContext({
      maxAgeDays: 30, sonarrItems: [], radarrItems: [],
    });
    // Sweep with empty queue returns early — but still hits finally.
    await sweeper.runSweep();
    expect(getPruneCalledWith()).toBe(30);
  });

  it('does not call pruneByAge when maxAgeDays is 0 (unlimited retention)', async () => {
    const { sweeper, getPruneCalledWith } = buildContext({
      maxAgeDays: 0, sonarrItems: [], radarrItems: [],
    });
    await sweeper.runSweep();
    expect(getPruneCalledWith()).toBeNull();
  });
});

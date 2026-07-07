'use strict';
const config = require('../config');
const log    = require('../logger');
const { getSeriesById } = require('../sonarr');
const { getMovieById } = require('../radarr');
const { getTmdbMovieById, getTmdbSeriesById, getTmdbTranslations } = require('../tmdb');
const { getOmdbById } = require('../omdb');
const { get: getFromCache, set: setToCache } = require('../media-cache');

// ── Sonarr (thin wrapper) ───────────────────────────────────────────────────
// OPEN-1 fallback guard: by contract TMDb returns the native overview or an empty string
// at language=<target>; during rare server-side regressions the language param is ignored
// and an English overview is returned instead. Verify against /translations so such a
// fallback is treated as English (translated + watermarked downstream) rather than mislabeled
// native. true=native, false=fallback(translate), null=unknown(unavailable -> trust, fail-safe).
async function isTmdbOverviewNative(tmdbId, type, lang, detailOverview) {
  try {
    const translations = await getTmdbTranslations(tmdbId, type);
    if (!translations) return null;
    const entry = translations.find(t => t && t.iso_639_1 === lang);
    const nativeOv = (entry && entry.data && entry.data.overview) ? entry.data.overview.trim() : '';
    if (!nativeOv) return false;
    return nativeOv === detailOverview.trim();
  } catch (e) {
    return null;
  }
}

async function fetchSonarrMetadata(seriesId, activeMode, plotEnabled = true) {
  const series = await getSeriesById(seriesId);
  const includePlot = plotEnabled;
  const aiOnly = config.translator?.aiOnlyPlot === true;
  // R13 note (FA-7, not code-fixed here): this fallback, and its byte-identical twin
  // in fetchRadarrMetadata() below, duplicate the DEFAULTS.translator.targetLang
  // literal ('ar') that config.js already guarantees post-merge -- dead-but-harmless
  // duplication, tracked per Master S2 R13; not yet swept to
  // config.DEFAULTS.translator.targetLang (the form F11.2 adopted at sweeper.js's
  // two history-item sites).
  const locale = activeMode === 'default_en' ? 'en-US' : (config.translator?.targetLang || 'ar');
  let tmdbSeries = null;
  if (includePlot && series.tmdbId) {
    const tmdbKey = `tmdb-tv:${series.tmdbId}:${locale}`;
    tmdbSeries = await getFromCache(tmdbKey);
    if (!tmdbSeries) {
      tmdbSeries = await getTmdbSeriesById(series.tmdbId, locale);
      if (tmdbSeries) {
        if (tmdbSeries.overview && locale !== 'en-US' && locale !== 'ar') {
          const native = await isTmdbOverviewNative(series.tmdbId, 'tv', locale, tmdbSeries.overview);
          if (native === false) { tmdbSeries._overviewNative = false; log.warn('Metadata', `TMDb language fallback \u2192 translating plot \u2192 "${series.title}" (${locale})`); }
        }
        await setToCache(tmdbKey, tmdbSeries);
      }
    }
  }
  let omdbData = null;
  if (config.omdb?.apiKey && series.imdbId) {
    const omdbKey = `omdb:${series.imdbId}`;
    omdbData = await getFromCache(omdbKey);
    if (!omdbData) {
      omdbData = await getOmdbById(series.imdbId);
      if (omdbData) await setToCache(omdbKey, omdbData);
    }
  }
  return { series, tmdbSeries, omdbData };
}

// ── Radarr metadata resolution ──────────────────────────────────────────────
async function fetchRadarrMetadata(movieId, activeMode, plotEnabled = true) {
  // No try/catch here — caller owns logging; the await re-throws naturally.
  const movie = await getMovieById(movieId);
  if (!movie) {
    return { movie: null, tmdbMovie: null, omdbData: null };
  }

  let tmdbMovie = null;
  const aiOnly = config.translator?.aiOnlyPlot === true;
  const locale = activeMode === 'default_en' ? 'en-US' : (config.translator?.targetLang || 'ar');
  const tmdbKey = movie.tmdbId ? `radarr:${movie.tmdbId}:${locale}` : null;
  if (tmdbKey) {
    tmdbMovie = await getFromCache(tmdbKey);
    if (!tmdbMovie) {
      try {
        tmdbMovie = await getTmdbMovieById(movie.tmdbId, locale);
        if (tmdbMovie) {
          if (tmdbMovie.overview && locale !== 'en-US' && locale !== 'ar') {
            const native = await isTmdbOverviewNative(movie.tmdbId, 'movie', locale, tmdbMovie.overview);
            if (native === false) { tmdbMovie._overviewNative = false; log.warn('Metadata', `TMDb language fallback \u2192 translating plot \u2192 "${movie.title}" (${locale})`); }
          }
          await setToCache(tmdbKey, tmdbMovie);
        }
      } catch (err) {
        log.warn('Metadata', `TMDb Fetch → Error → Radarr ID: ${movieId} | TMDb ID: ${movie.tmdbId} | ${err.message}`);
        tmdbMovie = null;
      }
    }
  }

  const r = movie.ratings || {};
  const needsOmdb = config.omdb?.apiKey &&
                    movie.imdbId &&
                    (!(r.imdb?.value > 0) ||
                     !(r.rottenTomatoes?.value > 0) ||
                     !(r.metacritic?.value > 0) ||
                     (plotEnabled && (aiOnly || !tmdbMovie?.overview) && movie.imdbId));
  let omdbData = null;
  if (needsOmdb) {
    const omdbKey = `omdb:${movie.imdbId}`;
    omdbData = await getFromCache(omdbKey);
    if (!omdbData) {
      omdbData = await getOmdbById(movie.imdbId);
      if (omdbData) await setToCache(omdbKey, omdbData);
    }
  }

  return { movie, tmdbMovie, omdbData };
}

module.exports = {
  fetchSonarrMetadata,
  fetchRadarrMetadata,
};

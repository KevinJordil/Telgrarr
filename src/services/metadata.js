'use strict';
const config = require('../config');
const log    = require('../logger');
const { getSeriesById } = require('../sonarr');
const { getMovieById } = require('../radarr');
const { getTmdbMovieById, getTmdbSeriesById } = require('../tmdb');
const { getOmdbById } = require('../omdb');
const { get: getFromCache, set: setToCache } = require('../media-cache');

// ── Sonarr (thin wrapper) ───────────────────────────────────────────────────
async function fetchSonarrMetadata(seriesId, activeMode) {
  const series = await getSeriesById(seriesId);
  const includePlot = config.sonarr?.includePlot !== false;
  const aiOnly = config.translator?.aiOnlyPlot === true;
  const locale = activeMode === 'default_en' ? 'en-US' : (config.translator?.targetLang || 'ar');
  let tmdbSeries = null;
  if (includePlot && series.tmdbId) {
    const tmdbKey = `tmdb-tv:${series.tmdbId}:${locale}`;
    tmdbSeries = await getFromCache(tmdbKey);
    if (!tmdbSeries) {
      tmdbSeries = await getTmdbSeriesById(series.tmdbId, locale);
      if (tmdbSeries) await setToCache(tmdbKey, tmdbSeries);
    }
  }
  let omdbData = null;
  if (includePlot && config.omdb?.apiKey && series.imdbId && (aiOnly || !(tmdbSeries && tmdbSeries.overview))) {
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
async function fetchRadarrMetadata(movieId, activeMode) {
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
        if (tmdbMovie) await setToCache(tmdbKey, tmdbMovie);
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
                     (config.radarr?.includePlot !== false && (aiOnly || !tmdbMovie?.overview) && movie.imdbId));
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

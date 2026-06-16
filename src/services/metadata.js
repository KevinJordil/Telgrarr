'use strict';
const config = require('../config');
const log    = require('../logger');
const { getSeriesById } = require('../sonarr');
const { getMovieById } = require('../radarr');
const { getTmdbMovieById } = require('../tmdb');
const { getOmdbById } = require('../omdb');
const { get: getFromCache, set: setToCache } = require('../media-cache');

// ── Sonarr (thin wrapper) ───────────────────────────────────────────────────
async function fetchSonarrMetadata(seriesId) {
  return await getSeriesById(seriesId);
}

// ── Radarr metadata resolution ──────────────────────────────────────────────
async function fetchRadarrMetadata(movieId, activeMode) {
  // No try/catch here — caller owns logging; the await re-throws naturally.
  const movie = await getMovieById(movieId);
  if (!movie) {
    return { movie: null, tmdbMovie: null, omdbData: null };
  }

  let tmdbMovie = null;
  const tmdbKey = movie.tmdbId ? `radarr:${movie.tmdbId}` : null;
  if (tmdbKey) {
    tmdbMovie = await getFromCache(tmdbKey);
    if (!tmdbMovie) {
      try {
        tmdbMovie = await getTmdbMovieById(movie.tmdbId, activeMode === 'default_en' ? 'en-US' : null);
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
                     (!tmdbMovie?.overview && movie.imdbId));
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

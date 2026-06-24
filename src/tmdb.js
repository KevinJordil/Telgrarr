'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');
const { isTmdbAuthError, trip, isTripped } = require('./services/provider-breaker');

async function getTmdbMovieById(tmdbId, langOverride = null) {
  if (!tmdbId) return null;
  if (isTripped('tmdb')) return null;
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      params: {
        api_key:  config.tmdb.apiKey,
        language: langOverride || 'en-US',
      },
    });
    return res.data;
  } catch (error) {
    if (isTmdbAuthError(error)) trip('tmdb');
    log.error('TMDb', `Metadata Fetch → Error → TMDb ID: [${tmdbId}] | ${error.message}`);
    return null;
  }
}

async function getTmdbSeriesById(tmdbId, langOverride = null) {
  if (!tmdbId) return null;
  if (isTripped('tmdb')) return null;
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}`, {
      params: {
        api_key:  config.tmdb.apiKey,
        language: langOverride || 'en-US',
      },
    });
    return res.data;
  } catch (error) {
    if (isTmdbAuthError(error)) trip('tmdb');
    log.error('TMDb', `Metadata Fetch → Error → TV ID: [${tmdbId}] | ${error.message}`);
    return null;
  }
}

async function getTmdbTranslations(tmdbId, type) {
  if (!tmdbId) return null;
  if (isTripped('tmdb')) return null;
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/${type}/${tmdbId}/translations`, {
      params: { api_key: config.tmdb.apiKey },
    });
    return (res.data && Array.isArray(res.data.translations)) ? res.data.translations : null;
  } catch (error) {
    if (isTmdbAuthError(error)) trip('tmdb');
    log.error('TMDb', `Translations Fetch \u2192 Error \u2192 ${type} ID: [${tmdbId}] | ${error.message}`);
    return null;
  }
}

module.exports = { getTmdbMovieById, getTmdbSeriesById, getTmdbTranslations };

'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');

async function getTmdbMovieById(tmdbId, langOverride = null) {
  if (!tmdbId) return null;
  try {
    const res = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      params: {
        api_key:  config.tmdb.apiKey,
        language: langOverride || config.tmdb.language,
      },
    });
    return res.data;
  } catch (error) {
    log.error('TMDb', `Metadata Fetch → Error → TMDb ID: [${tmdbId}] | ${error.message}`);
    return null;
  }
}

module.exports = { getTmdbMovieById };

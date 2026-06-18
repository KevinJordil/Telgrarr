'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');
const { isOmdbAuthError, trip, isTripped } = require('./services/provider-breaker');

async function getOmdbById(imdbId) {
  if (!imdbId || !config.omdb?.apiKey) return null;
  if (isTripped('omdb')) return null;
  try {
    const res = await axios.get('https://www.omdbapi.com/', {
      params: { i: imdbId, apikey: config.omdb.apiKey },
      timeout: 8000,
    });
    if (res.data?.Response === 'False') {
      if (isOmdbAuthError(res.data)) trip('omdb');
      return null;
    }
    return res.data;
  } catch (err) {
    log.error('OMDb', `Metadata Fetch → Error → ID: [${imdbId}] | ${err.message}`);
    return null;
  }
}

module.exports = { getOmdbById };

'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');
const { isOmdbAuthError, isOmdbRateLimitError, isOmdbQuotaExhausted, trip, tripRate, tripQuota, isTripped } = require('./services/provider-breaker');

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
      else if (isOmdbQuotaExhausted(res.data)) tripQuota('omdb');
      return null;
    }
    return res.data;
  } catch (err) {
    if (isOmdbRateLimitError(err)) tripRate('omdb');
    log.error('OMDb', `Metadata Fetch → Error → ID: [${imdbId}] | ${err.message}`);
    return null;
  }
}

module.exports = { getOmdbById };

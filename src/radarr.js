'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');

async function getMovieById(movieId) {
  try {
    const res = await axios.get(`${config.radarr.baseUrl}/api/v3/movie/${movieId}`, {
      headers: { 'X-Api-Key': config.radarr.apiKey },
      timeout: 15000,
    });
    return res.data;
  } catch (error) {
    log.error('Radarr', `Metadata Fetch → Error → Movie ID: [${movieId}] | ${error.message}`);
    throw error;
  }
}

module.exports = { getMovieById };

'use strict';
const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');

async function getSeriesById(seriesId) {
  const url = `${config.sonarr.baseUrl}/api/v3/series/${seriesId}`;
  try {
    const res = await axios.get(url, {
      headers: { 'X-Api-Key': config.sonarr.apiKey },
      timeout: 15000,
    });
    return res.data;
  } catch (error) {
    log.error('Sonarr', `Metadata Fetch → Error → Series ID: [${seriesId}] | ${error.message}`);
    throw error;
  }
}

module.exports = { getSeriesById };

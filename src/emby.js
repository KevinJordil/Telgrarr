const axios  = require('axios');
const config = require('./config');
const log    = require('./logger');

// Fire exactly one Emby library refresh — called only after Telegram loop completes
async function refreshLibrary() {
  const url = `${config.emby.refreshUrl}?api_key=${config.emby.apiKey}`;
  await axios.post(url);
  log.info('Emby', 'Library refresh triggered successfully.');
}

module.exports = { refreshLibrary };
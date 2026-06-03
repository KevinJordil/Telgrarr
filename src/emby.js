const axios  = require('axios');
const config = require('./config');

// Fire exactly one Emby library refresh — called only after Telegram loop completes
async function refreshLibrary() {
  // D.4 / C3: skip silently when Emby is not configured (empty refreshUrl).
  // Pre-guard, an empty URL became an invalid '?api_key=…' and threw every sweep.
  if (!config.emby.refreshUrl) return;
  const url = `${config.emby.refreshUrl}?api_key=${config.emby.apiKey}`;
  await axios.post(url);
}

module.exports = { refreshLibrary };
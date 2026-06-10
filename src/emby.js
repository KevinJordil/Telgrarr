const axios  = require('axios');
const config = require('./config');

// Fire exactly one Emby library refresh — called only after Telegram loop completes
async function refreshLibrary() {
  // D.4 / C3: skip silently when Emby is not configured (empty refreshUrl).
  // Pre-guard, an empty URL became an invalid '?api_key=…' and threw every sweep.
  // F.10/O5: return a boolean so the caller emits SWEEP_EMBY only on a real refresh
  // (an unconfigured skip must NOT surface a phantom success event to the GUI).
  if (!config.emby.refreshUrl) return false;
  const url = `${config.emby.refreshUrl}?api_key=${config.emby.apiKey}`;
  await axios.post(url);
  return true;
}

module.exports = { refreshLibrary };
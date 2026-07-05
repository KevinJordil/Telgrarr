'use strict';

const axios  = require('axios');
const config = require('./config');

// Fire exactly one Emby library refresh — called only after Telegram loop completes
async function refreshLibrary() {
  // D.4 / C3: skip silently when Emby is not configured (empty refreshUrl).
  // Pre-guard, an empty URL became an invalid '?api_key=…' and threw every sweep.
  // F.10/O5: return a boolean so the caller emits SWEEP_EMBY only on a real refresh
  // (an unconfigured skip must NOT surface a phantom success event to the GUI).
  // F.11/FU-1: also skip when apiKey is empty — a keyless refreshUrl would POST an
  // invalid '?api_key=' and throw every sweep (config logs a warn at load).
  if (!config.emby.refreshUrl || !config.emby.apiKey) return false;
  const url = `${config.emby.refreshUrl}?api_key=${config.emby.apiKey}`;
  // FA-43: 10s timeout -- a hung Emby socket must not block runSweep forever
  // (aligns with tmdb.js's ceiling); unconfigured emby is already handled above.
  await axios.post(url, undefined, { timeout: 10000 });
  return true;
}

module.exports = { refreshLibrary };
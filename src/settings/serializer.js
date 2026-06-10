// @ts-check
'use strict';

const config = require('../config');
const { SETTINGS_SCHEMA } = require('../settings-schema');
const { maskSecret } = require('./secrets');

/**
 * @returns {Object} settings with secret fields replaced by the mask sentinel
 */
function getMaskedSettings() {
  // Pre-seed root keys in the exact legacy order to pass strict stringified byte-for-byte parity,
  // while remaining Open/Closed to new schema fields being appended dynamically.
  const settings = {
    listenerPort: config.listenerPort,
    listenerHost: config.listenerHost,
    batchWindowMs: undefined,
    sonarr: undefined,
    telegram: undefined,
    emby: undefined,
    radarr: undefined,
    tmdb: undefined,
    seerr: undefined,
    omdb: undefined,
    translator: undefined,
    mediaCache: undefined,
    backup: undefined,
    logging: undefined,
  };

  // Dynamically extract and mask fields based on the single source of truth
  for (const section of SETTINGS_SCHEMA) {
    for (const field of section.fields) {
      const keys = field.key.split('.');
      let val = keys.reduce((o, k) => (o != null ? o[k] : undefined), config);

      if (field.type === 'secret') {
        val = maskSecret(val);
      }

      let cur = settings;
      for (let i = 0; i < keys.length - 1; i++) {
        if (cur[keys[i]] === undefined) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = val;
    }
  }

  // Explicitly apply structure for non-schema fields (GAP HANDLED)
  settings.backup = {
    enabled: config.backup.enabled,
    intervalDays: config.backup.intervalDays,
    retainCount: config.backup.retainCount,
  };

  // Clean up any unused pre-seeded keys
  for (const key of Object.keys(settings)) {
    if (settings[key] === undefined) delete settings[key];
  }

  return settings;
}

module.exports = { getMaskedSettings };

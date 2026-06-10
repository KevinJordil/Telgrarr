// @ts-check
'use strict';

const config = require('../config');

/**
 * @param {Object} incoming proposed settings patch
 * @returns {boolean} true if a restart-only field changed
 */
function needsRestart(incoming) {
  if (incoming.listenerPort !== undefined && incoming.listenerPort !== config.listenerPort) return true;
  if (incoming.listenerHost !== undefined && incoming.listenerHost !== config.listenerHost) return true;
  if (incoming.logging?.level !== undefined && incoming.logging.level !== config.logging.level) return true;
  return false;
}

module.exports = { needsRestart };

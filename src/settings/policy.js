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

/**
 * H4.3a: true when the operator is changing the listener port to a NEW value on a
 * deployment where PORT is NOT env-managed (env-managed => read-only, ignored).
 * Gates the route's best-effort bind pre-flight so a save never arms a restart into
 * an unbindable port. H0 remains the definitive backstop.
 * @param {Object} incoming proposed settings patch
 * @returns {boolean}
 */
function portChangeRequiresPreflight(incoming) {
  return incoming.listenerPort !== undefined
    && !config.envOverrides.PORT
    && incoming.listenerPort !== config.PORT;
}

module.exports = { needsRestart, portChangeRequiresPreflight };

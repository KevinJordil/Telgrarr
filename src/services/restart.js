'use strict';
// [H2.1a] Single restart authority (SRP). The ONLY module that decides whether
// an automatic restart is possible and the ONLY one that triggers one.
//
// CAPABILITY: can THIS process come back if it exits? An explicit operator
// override wins; otherwise auto-detect PM2 (the reference supervisor).
//   RESTART_CAPABLE=1|true|yes|on  -> force ON  (systemd Restart=always, Docker)
//   RESTART_CAPABLE=0|false|no|off -> force OFF (PM2 with autorestart disabled)
//   unset -> capable iff PM2-managed (PM2 injects PM2_HOME and, autorestart on by
//   default, respawns on exit). The GUI poll has a recovery timeout, so an
//   over-optimistic "capable" degrades to manual guidance rather than hanging.
const log = require('../logger');

function isRestartCapable() {
  const raw = process.env.RESTART_CAPABLE;
  if (raw !== undefined && String(raw).trim() !== '') {
    const v = String(raw).trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }
  return Boolean(process.env.PM2_HOME);
}

// Graceful self-restart by REUSING the existing shutdown orchestrator (index.js
// SIGTERM handler -> gracefulShutdown: flush sessions, flush events, release the
// D.1 lock, exit 0). The supervisor then respawns. Manager-agnostic: no pm2
// exec, no app-name literal. Caller MUST have already flushed its HTTP response
// (e.g. from res.on('finish')) before this runs.
function requestRestart(source) {
  if (!isRestartCapable()) {
    log.error('System', 'Restart \u2192 Refused \u2192 not capable (RESTART_CAPABLE unset) \u2192 source: ' + source);
    return false;
  }
  log.audit('System', 'Restart \u2192 Armed \u2192 graceful self-restart via supervisor \u2192 source: ' + source);
  setImmediate(() => process.kill(process.pid, 'SIGTERM'));
  return true;
}

module.exports = { isRestartCapable, requestRestart };

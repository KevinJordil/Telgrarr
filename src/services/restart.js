'use strict';
// [H2.1a] Single restart authority (SRP). The ONLY module that decides whether
// an automatic restart is possible and the ONLY one that triggers one.
//
// CAPABILITY is an EXPLICIT operator declaration via RESTART_CAPABLE, never
// inferred from supervisor internals. A respawning manager (PM2 autorestart,
// systemd Restart=always, Docker restart policy) sets RESTART_CAPABLE=1.
// Inferring from PM2 pm_id is intentionally REJECTED: it false-positives when a
// PM2 app runs autorestart:false, claiming a capability the deployment lacks.
// Absent the flag we refuse and the caller surfaces manual guidance (SD-4).
const log = require('../logger');

function isRestartCapable() {
  const v = String(process.env.RESTART_CAPABLE ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
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

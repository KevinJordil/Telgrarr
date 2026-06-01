'use strict';
require('./load-env')();   // RD-1: load .env into process.env BEFORE config/logger evaluate (no .env => no-op)
const log                               = require('./logger');
const config                            = require('./config');
const backup                            = require('./backup');
const { startListener }                 = require('./listener');
const blacklist                         = require('./blacklist');
const { checkAndRotateLogs }            = require('./log-rotator');
const { getQueue }                      = require('./queue');
const { runSweep, recoverCrashedSweep } = require('./sweeper');
const { flushSessions }                 = require('./middlewares/auth');
const { loadEvents, flushEvents }       = require('./events');

log.info('App', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
log.info('App', 'System Startup → Success → telgrarr initialized');
log.info('App', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

loadEvents();
blacklist.load();
startListener();

// ── GAP-1 & GAP-6: Startup Recovery Sweep ────────────────────────────────────
setTimeout(async () => {
  try {
    await recoverCrashedSweep();
    const q = await getQueue();
    if (q && q.length > 0) {
      log.warn('Sweeper', 'Startup Recovery → Scheduled → Queue non-empty on boot');
      await runSweep();
    }
  } catch (err) {
    log.error('Sweeper', `Startup Recovery → Error → ${err.message}`);
  }
}, 30000);

// ── Background Backup Scheduler ──────────────────────────────────────────────
function checkAndRunBackup() {
  try {
    if (!config.backup || !config.backup.enabled) return;
    const backups = backup.listBackups();
    const now = Date.now();
    const intervalMs = (config.backup.intervalDays || 7) * 24 * 60 * 60 * 1000;
    if (backups.length === 0 || (now - new Date(backups[0].createdAt).getTime() > intervalMs)) {
      log.info('Backup', 'Backup Scheduler → Schedule Met → Background backup initiated');
      backup.createBackup();
    }
  } catch (err) {
    log.error('Backup', `Backup Scheduler → Error → ${err.message}`);
  }
}

setTimeout(checkAndRunBackup, 5 * 60 * 1000);
setInterval(checkAndRunBackup, 12 * 60 * 60 * 1000);

// ── Log Rotation Scheduler ───────────────────────────────────────────────────
setTimeout(checkAndRotateLogs, 2 * 60 * 1000);
setInterval(checkAndRotateLogs, 60 * 60 * 1000);

// ── Centralized Graceful Shutdown Orchestrator ───────────────────────────────
let isShuttingDown = false;
async function gracefulShutdown(signal, code = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info('App', `System Shutdown → Initiated → Signal: ${signal}`);

  try {
    await flushSessions();
    log.info('Auth', `Sessions → Flushed → Signal: ${signal}`);
  } catch (err) {
    log.error('Auth', `Sessions → Flush Error → ${err.message}`);
  }

  try {
    await flushEvents();
    log.info('Events', `Ring Buffer → Flushed → Signal: ${signal}`);
  } catch (err) {
    log.error('Events', `Ring Buffer → Flush Error → ${err.message}`);
  }

  log.info('App', 'System Shutdown → Complete → telgrarr stopped');
  process.exit(code);
}

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  log.error('App', `Process → Crash → Uncaught exception: ${err.message}`);
  gracefulShutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  log.error('App', `Process → Crash → Unhandled rejection: ${reason}`);
  gracefulShutdown('unhandledRejection', 1);
});

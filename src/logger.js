'use strict';
const path = require('path');
const fs   = require('fs');
const pino = require('pino');
const events = require('./events');

const logsDir = path.join(__dirname, '../logs');
fs.mkdirSync(logsDir, { recursive: true });

const appDest   = pino.destination({ dest: path.join(logsDir, 'app.log'),   sync: true });
const errDest   = pino.destination({ dest: path.join(logsDir, 'error.log'), sync: true });
const auditDest = pino.destination({ dest: path.join(logsDir, 'audit.log'), sync: true });

const fileLogger  = pino(appDest);
const errorLogger = pino(errDest);
const auditLogger = pino(auditDest);

const LOG_BUFFER_SIZE = 500;
const logBuffer = [];
let _logSeq = 0;

const LEVEL_ORDER = { error: 0, warn: 1, info: 2 };
let _configuredLevel = 'info';

function setLevel(level) {
  if (typeof level === 'string' && LEVEL_ORDER[level] != null) {
    _configuredLevel = level;
  }
}

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function _isLevelAllowed(level) {
  if (level === 'audit') return true;
  return LEVEL_ORDER[level] <= LEVEL_ORDER[_configuredLevel];
}

function _write(level, module, message) {
  const ts = new Date().toISOString();
  if (_logSeq >= Number.MAX_SAFE_INTEGER) _logSeq = 0;
  const entry = {
    id: `log-${Date.now()}-${++_logSeq}`,
    level,
    module,
    message,
    timestamp: ts,
  };
  const pinoPayload = { id: entry.id, module, msg: message, time: ts };

  if (level === 'audit') {
    auditLogger.info(pinoPayload);
    fileLogger.info({ ...pinoPayload, audit: true });
  } else if (level === 'error') {
    errorLogger.error(pinoPayload);
    fileLogger.error(pinoPayload);
  } else if (level === 'warn') {
    fileLogger.warn(pinoPayload);
  } else {
    fileLogger.info(pinoPayload);
  }

  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();

  if (level !== 'audit') {
    try {
      events.emit(`log.${level}`, level, module, message, {});
    } catch (err) {
      try { process.stderr.write(`[logger] events.emit failed: ${err && err.message}\n`); } catch (_) {}
    }
  }
}

function info(module, message) {
  if (!_isLevelAllowed('info')) return;
  process.stdout.write(`[${timestamp()}] [INFO]  [${module}] ${message}\n`);
  _write('info', module, message);
}

function warn(module, message) {
  if (!_isLevelAllowed('warn')) return;
  process.stdout.write(`[${timestamp()}] [WARN]  [${module}] ${message}\n`);
  _write('warn', module, message);
}

function error(module, message) {
  if (!_isLevelAllowed('error')) return;
  process.stderr.write(`[${timestamp()}] [ERROR] [${module}] ${message}\n`);
  _write('error', module, message);
}

function audit(module, message) {
  process.stdout.write(`[${timestamp()}] [AUDIT] [${module}] ${message}\n`);
  _write('audit', module, message);
}

function getRecentLogs(limit = 100) {
  return logBuffer.slice(-limit);
}

function getFilteredLogs({ limit = 100, level, module, since } = {}) {
  let result = logBuffer;
  if (level)  result = result.filter(e => e.level === level);
  if (module) result = result.filter(e => e.module === module);
  if (since)  result = result.filter(e => e.timestamp > since);
  return result.slice(-limit);
}

function reopenLogFiles() {
  for (const [name, dest] of [['app', appDest], ['error', errDest], ['audit', auditDest]]) {
    try {
      dest.reopen();
    } catch (err) {
      try { process.stderr.write(`[logger] ${name} reopen failed: ${err && err.message}\n`); } catch (_) {}
    }
  }
}

module.exports = { info, warn, error, audit, getRecentLogs, getFilteredLogs, reopenLogFiles, setLevel };

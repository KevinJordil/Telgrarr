'use strict';
const path = require('path');
const pino = require('pino');
const events = require('./events');

const logsDir = path.join(__dirname, '../logs');

const appDest   = pino.destination(path.join(logsDir, 'app.log'));
const errDest   = pino.destination(path.join(logsDir, 'error.log'));
const auditDest = pino.destination(path.join(logsDir, 'audit.log'));

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
    events.emit(`log.${level}`, level, module, message, {});
  }
}

function info(module, message) {
  if (!_isLevelAllowed('info')) return;
  process.stdout.write(`[${timestamp()}] [INFO]  [${module}] ${message}
`);
  _write('info', module, message);
}

function warn(module, message) {
  if (!_isLevelAllowed('warn')) return;
  process.stdout.write(`[${timestamp()}] [WARN]  [${module}] ${message}
`);
  _write('warn', module, message);
}

function error(module, message) {
  if (!_isLevelAllowed('error')) return;
  process.stderr.write(`[${timestamp()}] [ERROR] [${module}] ${message}
`);
  _write('error', module, message);
}

function audit(module, message) {
  process.stdout.write(`[${timestamp()}] [AUDIT] [${module}] ${message}
`);
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
  appDest.reopen();
  errDest.reopen();
  auditDest.reopen();
}

module.exports = { info, warn, error, audit, getRecentLogs, getFilteredLogs, reopenLogFiles, setLevel };

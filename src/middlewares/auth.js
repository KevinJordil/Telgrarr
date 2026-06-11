// @ts-check
'use strict';
const fs          = require('fs');
const path        = require('path');
const writeAtomic = require('write-file-atomic');
const { readCookie, COOKIE_NAME } = require('../auth/session-cookie');
const config = require('../config');
const log = require('../logger');

const SESSION_FILE = path.join(config.DATA_DIR, 'sessions.json');
const activeSessions = new Map();

/**
 * @returns {void}
 */
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      const now = Date.now();
      for (const [token, expiry] of Object.entries(data)) {
        if (expiry > now) activeSessions.set(token, expiry);
      }
    }
  } catch (err) {
    log.error('Auth', `Sessions Load → Error → ${err.message}`);
  }
}
loadSessions();

let _persistTimer = null;
/**
 * @returns {void} debounced session flush (30s)
 */
function persistSessions() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      const data = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
      writeAtomic(SESSION_FILE, data, { mode: 0o600 }, (err) => {
        if (err) log.error('Auth', `Sessions Save → Error → ${err.message}`);
      });
    } catch (err) {
      log.error('Auth', `Sessions Serialize → Error → ${err.message}`);
    }
  }, 30000);
}

/**
 * @returns {Promise<void>} immediate session flush (SIGINT)
 */
async function flushSessions() {
  if (_persistTimer) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  const data = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
  await new Promise((resolve, reject) => {
    writeAtomic(SESSION_FILE, data, { mode: 0o600 }, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

/**
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns {void} express middleware: 401 unless a valid session cookie
 */
function requireAuth(req, res, next) {
  // C.7c: cookie-only — legacy Bearer accepted-path removed (S4 complete).
  const token = readCookie(req, COOKIE_NAME);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const expiry = activeSessions.get(token);
  const now    = Date.now();

  if (!expiry || now > expiry) {
    if (expiry) {
      activeSessions.delete(token);
      persistSessions();
    }
    return res.status(401).json({ error: 'Session expired' });
  }

  const thirtyDays  = 30 * 24 * 60 * 60 * 1000;
  const fifteenDays = 15 * 24 * 60 * 60 * 1000;
  if (expiry - now < fifteenDays) {
    activeSessions.set(token, now + thirtyDays);
    persistSessions();
  }

  next();
}

module.exports = { activeSessions, requireAuth, persistSessions, flushSessions };

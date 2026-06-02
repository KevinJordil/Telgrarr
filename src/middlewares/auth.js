'use strict';
const fs          = require('fs');
const path        = require('path');
const writeAtomic = require('write-file-atomic');
const { readCookie, COOKIE_NAME } = require('../auth/session-cookie');

const SESSION_FILE = path.join(__dirname, '../../data/sessions.json');
const activeSessions = new Map();

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
    console.error('[Auth] Failed to load sessions:', err.message);
  }
}
loadSessions();

let _persistTimer = null;
function persistSessions() {
  if (_persistTimer) return;
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    try {
      const data = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
      writeAtomic(SESSION_FILE, data, (err) => {
        if (err) console.error('[Auth] Failed to save sessions:', err.message);
      });
    } catch (err) {
      console.error('[Auth] Serialization error:', err.message);
    }
  }, 30000);
}

async function flushSessions() {
  if (_persistTimer) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  const data = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
  await new Promise((resolve, reject) => {
    writeAtomic(SESSION_FILE, data, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearer = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : undefined;
  // C.7: Bearer (legacy, kept for rollback) OR httpOnly session cookie.
  const token  = bearer || readCookie(req, COOKIE_NAME);
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

'use strict';
const express     = require('express');
const fs          = require('fs');
const crypto      = require('crypto');
const router      = express.Router();
const log         = require('../logger');
const events      = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
const writeAtomic = require('write-file-atomic');
const { activeSessions, requireAuth, persistSessions } = require('../middlewares/auth');
const path        = require('path');
const config      = require('../config');
const { hashNew, verify, needsUpgrade } = require('../auth/credentials');
const rateLimit = require('../auth/rate-limit');
const { COOKIE_NAME, cookieOptions, readCookie } = require('../auth/session-cookie');

const AUTH_FILE     = path.join(config.DATA_DIR, 'auth.json');
const SESSION_FILE  = path.join(config.DATA_DIR, 'sessions.json');
const RECOVERY_FILE = path.join(config.DATA_DIR, 'recovery.json');

function persistNow() {
  try {
    const data = JSON.stringify(Object.fromEntries(activeSessions), null, 2);
    writeAtomic.sync(SESSION_FILE, data);
  } catch (err) {
    log.error('Auth', `Session Persistence → Error → ${err.message}`);
  }
}

// H7.1: single session-mint path for first-run auto-login. The existing /login keeps
// its inline mint (security-critical + test-covered - deliberately not refactored here).
function issueSession(req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  activeSessions.set(token, Date.now() + thirtyDays);
  persistNow();
  res.cookie(COOKIE_NAME, token, cookieOptions(req, config.COOKIE_SECURE, thirtyDays));
  return token;
}

// H7.1: first-run gate. "Configured" == auth.json EXISTS (existence, not parseability):
// the public setup route must NEVER overwrite an existing credential file. A corrupt
// auth.json is recovered via `npm run recover` / setup-auth, never via this route.
function isAuthConfigured() {
  return fs.existsSync(AUTH_FILE);
}

// -- POST /api/login ----------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }
    if (!fs.existsSync(AUTH_FILE)) {
      return res.status(500).json({ error: 'Auth not configured' });
    }
    
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    
    // S6: verify on EVERY attempt (even an unknown user) so a missing username
    // and a wrong password cost the same — closes the enumeration timing oracle.
    const knownUser  = username === authData.username;
    const passwordOk = verify(password, authData);
    const ip = req.ip || 'unknown';
    if (!knownUser || !passwordOk) {
      const delayMs = rateLimit.recordFailure(ip, username);
      const reason = knownUser ? 'Bad Password' : 'Unknown User';
      log.audit('Auth', `Authentication → Rejected → ${reason}: [${username}]`);
      events.emit(EVENT_TYPES.AUTH_LOGIN_FAILED, 'warn', 'Auth', `Authentication rejected for [${username}]`, { username });
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
      rateLimit.clear(ip, username);
      if (needsUpgrade(authData)) {
        try {
          writeAtomic.sync(AUTH_FILE, JSON.stringify({ username: authData.username, ...hashNew(password) }, null, 2));
          log.audit('Auth', `Credential Upgrade → Success → [${username}]`);
        } catch (err) {
          log.error('Auth', `Credential Upgrade → Error → ${err.message}`);
        }
      }

    const token = crypto.randomBytes(32).toString('hex');
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    activeSessions.set(token, Date.now() + thirtyDays);
    persistNow();
    
    log.audit('Auth', `Authentication → Success → [${username}]`);
    events.emit(EVENT_TYPES.AUTH_LOGIN_SUCCESS, 'info', 'Auth', `Authentication successful for [${username}]`, { username });
    res.cookie(COOKIE_NAME, token, cookieOptions(req, config.COOKIE_SECURE, thirtyDays));
    res.json({ success: true, token });
    
  } catch (err) {
    log.error('Auth', `Authentication → Error → ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// -- POST /api/auth/password --------------------------------------------------
router.post('/auth/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (!verify(currentPassword, authData)) {
      log.audit('Auth', `Password Change → Rejected → Bad Current Password: [${authData.username}]`);
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    
    writeAtomic.sync(
      AUTH_FILE,
      JSON.stringify({ username: authData.username, ...hashNew(newPassword) }, null, 2)
    );
    
    log.audit('Auth', `Password Change → Success → [${authData.username}]`);
    events.emit(EVENT_TYPES.AUTH_PW_CHANGED, 'info', 'Auth', 'Password changed successfully', {});
    res.json({ success: true });
    
  } catch (err) {
    log.error('Auth', `Password Change → Error → ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// -- POST /api/auth/recover ---------------------------------------------------
router.post('/auth/recover', (req, res) => {
  try {
    const { recoveryToken, newPassword } = req.body;
    if (!recoveryToken || !newPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    let recovery;
    try {
      recovery = JSON.parse(fs.readFileSync(RECOVERY_FILE, 'utf8'));
    } catch (readErr) {
      if (readErr.code === 'ENOENT') {
        log.audit('Auth', `Recovery Execution → Rejected → Token file not found`);
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
      throw readErr;
    }
    
    if (Date.now() > recovery.expiry) {
      try { fs.unlinkSync(RECOVERY_FILE); } catch (_) {}
      log.audit('Auth', `Recovery Execution → Rejected → Token expired`);
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    const provided = Buffer.from(recoveryToken, 'hex');
    const stored   = Buffer.from(recovery.token, 'hex');
    const valid    = provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
    
    if (!valid) {
      log.audit('Auth', `Recovery Execution → Rejected → Token mismatch`);
      return res.status(400).json({ error: 'Invalid or expired token' });
    }
    
    try { fs.unlinkSync(RECOVERY_FILE); } catch (_) {}
    
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    
    writeAtomic.sync(
      AUTH_FILE,
      JSON.stringify({ username: authData.username, ...hashNew(newPassword) }, null, 2)
    );
    
    activeSessions.clear();
    persistNow();
    
    log.audit('Auth', `Recovery Execution → Success → Root password reset, sessions invalidated`);
    events.emit(
      EVENT_TYPES.AUTH_PASSWORD_RESET,
      'warn',
      'Auth',
      'Root password reset via recovery token',
      {}
    );
    res.json({ success: true });
    
  } catch (err) {
    log.error('Auth', `Recovery Execution → Error → ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// -- POST /api/logout ---------------------------------------------------------
router.post('/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const bearer = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.split(' ')[1] : undefined;
    const token = bearer || readCookie(req, COOKIE_NAME);
    if (token && activeSessions.delete(token)) persistNow();
    res.clearCookie(COOKIE_NAME, cookieOptions(req, config.COOKIE_SECURE));
    log.audit('Auth', 'Logout → Success → Session cleared');
    res.json({ success: true });
  } catch (err) {
    log.error('Auth', `Logout → Error → ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// -- GET /api/auth/setup-status -----------------------------------------------
// Public, read-only. Leaks ONLY whether first-run setup is still open (a boolean).
router.get('/auth/setup-status', (req, res) => {
  res.json({ configured: isAuthConfigured() });
});

// -- POST /api/auth/setup -----------------------------------------------------
// First-run admin creation. OPEN only while no auth.json exists; once created the file
// exists so every later call returns 409 (permanently closed). Never overwrites creds.
// Single-instance (RD-8) + a synchronous check->hash->write section (no await between
// the existence check and the write) make the guard race-free. Auto-logs-in on success.
router.post('/auth/setup', (req, res) => {
  try {
    if (isAuthConfigured()) {
      return res.status(409).json({ error: 'Setup already complete' });
    }
    const { username, password, confirm } = req.body || {};
    const uname = (username || '').trim();
    if (!uname) {
      return res.status(400).json({ error: 'Username cannot be empty' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (password !== confirm) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
    writeAtomic.sync(
      AUTH_FILE,
      JSON.stringify({ username: uname, ...hashNew(password) }, null, 2),
      { mode: 0o600 }
    );
    issueSession(req, res);
    log.audit('Auth', `First-Run Setup \u2192 Success \u2192 Admin account created: [${uname}]`);
    events.emit(EVENT_TYPES.AUTH_LOGIN_SUCCESS, 'info', 'Auth', `First-run admin account created: [${uname}]`, { username: uname });
    res.json({ success: true });
  } catch (err) {
    log.error('Auth', `First-Run Setup \u2192 Error \u2192 ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;

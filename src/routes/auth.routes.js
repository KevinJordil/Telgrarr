'use strict';
const express     = require('express');
const fs          = require('fs');
const crypto      = require('crypto');
const router      = express.Router();
const log         = require('../logger');
const events      = require('../events');
const EVENT_TYPES = require('../../gui/src/shared/events.json');
const writeAtomic = require('write-file-atomic');
const { activeSessions, requireAuth, persistSessions } = require('../middlewares/auth');
const path        = require('path');
const config      = require('../config');
const { hashNew, verify, needsUpgrade } = require('../auth/credentials');

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

// -- POST /api/login ----------------------------------------------------------
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }
    if (!fs.existsSync(AUTH_FILE)) {
      return res.status(500).json({ error: 'Auth not configured' });
    }
    
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    
    if (username !== authData.username) {
      log.audit('Auth', `Authentication → Rejected → Unknown User: [${username}]`);
      events.emit(EVENT_TYPES.AUTH_LOGIN_FAILED, 'warn', 'Auth', `Authentication rejected for [${username}]`, { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!verify(password, authData)) {
      log.audit('Auth', `Authentication → Rejected → Bad Password: [${username}]`);
      events.emit(EVENT_TYPES.AUTH_LOGIN_FAILED, 'warn', 'Auth', `Authentication rejected for [${username}]`, { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
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

module.exports = router;

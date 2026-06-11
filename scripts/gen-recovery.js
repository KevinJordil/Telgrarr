'use strict';
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const writeAtomic = require('write-file-atomic');
require('../src/load-env')();   // RD-1: honor .env for DATA_DIR (no .env => no-op)

const DATA_DIR      = process.env.DATA_DIR || path.join(__dirname, '../data');
const RECOVERY_FILE = path.join(DATA_DIR, 'recovery.json');
const TTL_MS        = 15 * 60 * 1000;

try {
  const token   = crypto.randomBytes(32).toString('hex');
  const expiry  = Date.now() + TTL_MS;
  const payload = JSON.stringify({ token, expiry }, null, 2);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeAtomic.sync(RECOVERY_FILE, payload, { mode: 0o600 });

  const expiresAt = new Date(expiry).toLocaleTimeString();

  console.log('');
  console.log('========================================');
  console.log('  TELGRARR -- PASSWORD RECOVERY TOKEN  ');
  console.log('========================================');
  console.log('  Token   : ' + token);
  console.log('  Expires : ' + expiresAt + ' (15 minutes)');
  console.log('========================================');
  console.log('  Open GUI -> Forgot Password?');
  console.log('  Enter token to set a new password.');
  console.log('  Token is burned on first use.');
  console.log('');
} catch (err) {
  console.error('[Recovery] Failed to write recovery token: ' + err.message);
  process.exit(1);
}

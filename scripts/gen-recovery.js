'use strict';
const path        = require('path');
const crypto      = require('crypto');
const writeAtomic = require('write-file-atomic');

const RECOVERY_FILE = path.join(__dirname, '../data/recovery.json');
const TTL_MS        = 15 * 60 * 1000;

try {
  const token   = crypto.randomBytes(32).toString('hex');
  const expiry  = Date.now() + TTL_MS;
  const payload = JSON.stringify({ token, expiry }, null, 2);

  writeAtomic.sync(RECOVERY_FILE, payload);

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

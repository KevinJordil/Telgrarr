'use strict';
const crypto = require('crypto');

// Legacy KDF parameters — FROZEN for parity (C.1 extraction): pbkdf2 with the salt
// passed verbatim as a UTF-8 string (hex salt is NOT hex-decoded), 1000 iterations,
// 64-byte derived key, sha512, hex-encoded output. C.2 layers scrypt on top of this.
const PBKDF2_ITERATIONS = 1000;
const PBKDF2_KEYLEN     = 64;
const PBKDF2_DIGEST     = 'sha512';

function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
}

function verify(password, salt, expectedHash) {
  return hashPassword(password, salt) === expectedHash;
}

module.exports = { hashPassword, verify };

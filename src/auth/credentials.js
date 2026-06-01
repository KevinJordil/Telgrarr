'use strict';
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Credential KDF — the single home for password hashing + verification.
// Records carry an `algo` tag. NEW credentials use scrypt (the current algo);
// legacy UNTAGGED records are pbkdf2 (C.1 params, FROZEN for read parity) and
// are transparently upgraded to scrypt on the next successful login (C.2).
// Constant-time comparison is layered in C.4.
// ---------------------------------------------------------------------------
const ALGO_CURRENT = 'scrypt';
const ALGO_LEGACY  = 'pbkdf2';

// scrypt cost (Node core; ~16 MiB working set, within the 32 MiB default maxmem).
const SCRYPT_N      = 16384;
const SCRYPT_R      = 8;
const SCRYPT_P      = 1;
const SCRYPT_KEYLEN = 64;

// Legacy pbkdf2 — read-only parity with pre-C.2 records.
const PBKDF2_ITERATIONS = 1000;
const PBKDF2_KEYLEN     = 64;
const PBKDF2_DIGEST     = 'sha512';

function _scrypt(password, salt) {
  return crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
    .toString('hex');
}

function _pbkdf2(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
}

function _hashFor(algo, password, salt) {
  return algo === ALGO_LEGACY ? _pbkdf2(password, salt) : _scrypt(password, salt);
}

// Produce a fresh credential fragment { algo, salt, hash } using the current algo.
function hashNew(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { algo: ALGO_CURRENT, salt, hash: _scrypt(password, salt) };
}

// Verify a password against a stored record { algo?, salt, hash }; untagged => legacy.
function verify(password, record) {
  const algo = record.algo || ALGO_LEGACY;
  return _hashFor(algo, password, record.salt) === record.hash;
}

// True when a record is not on the current algo and should be re-hashed.
function needsUpgrade(record) {
  return (record.algo || ALGO_LEGACY) !== ALGO_CURRENT;
}

module.exports = { hashNew, verify, needsUpgrade };

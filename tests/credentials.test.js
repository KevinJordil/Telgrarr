import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const crypto = require('crypto');
const { hashNew, verify, needsUpgrade } = require('../src/auth/credentials.js');

// A legacy (pre-C.2) UNTAGGED pbkdf2 record, built exactly as the old code did.
function legacyRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { username: 'root', salt, hash }; // no algo tag
}

describe('credentials — C.2 scrypt + pbkdf2 migration', () => {

  it('verifies a legacy untagged pbkdf2 record (read parity)', () => {
    const rec = legacyRecord('hunter2pw');
    expect(verify('hunter2pw', rec)).toBe(true);
    expect(verify('wrong-pw', rec)).toBe(false);
  });

  it('verifies an explicitly pbkdf2-tagged record identically', () => {
    const rec = { ...legacyRecord('hunter2pw'), algo: 'pbkdf2' };
    expect(verify('hunter2pw', rec)).toBe(true);
  });

  it('flags legacy records for upgrade, not scrypt records', () => {
    expect(needsUpgrade(legacyRecord('x'))).toBe(true);
    expect(needsUpgrade({ algo: 'pbkdf2', salt: 'a', hash: 'b' })).toBe(true);
    expect(needsUpgrade(hashNew('x'))).toBe(false);
  });

  it('hashNew yields a tagged scrypt record that round-trips', () => {
    const rec = hashNew('s3cret-password');
    expect(rec.algo).toBe('scrypt');
    expect(typeof rec.salt).toBe('string');
    expect(rec.hash).toHaveLength(128); // 64 bytes, hex
    expect(verify('s3cret-password', rec)).toBe(true);
    expect(verify('nope', rec)).toBe(false);
  });

  it('scrypt verify rejects a pbkdf2 hash for the same input (algos differ)', () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const pbkdf2 = crypto.pbkdf2Sync('pw', salt, 1000, 64, 'sha512').toString('hex');
    expect(verify('pw', { algo: 'scrypt', salt, hash: pbkdf2 })).toBe(false);
  });

});

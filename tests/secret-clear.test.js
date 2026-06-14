import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// secrets.js is CommonJS; load it through a native require (mirrors the repo harness).
const require = createRequire(import.meta.url);
const { pickSecret, isMasked, maskSecret, SECRET_MASK } = require('../src/settings/secrets.js');

describe('secrets.pickSecret (EDGE-1: explicit clear vs keep)', () => {
  it('keeps the stored value when the field is absent (undefined/null)', () => {
    expect(pickSecret(undefined, 'stored-key')).toBe('stored-key');
    expect(pickSecret(null, 'stored-key')).toBe('stored-key');
  });

  it('keeps the stored value when the submitted value is the mask sentinel', () => {
    expect(isMasked(SECRET_MASK)).toBe(true);
    expect(pickSecret(SECRET_MASK, 'stored-key')).toBe('stored-key');
  });

  it('sets a new value when a real (non-mask) string is submitted', () => {
    expect(pickSecret('fresh-key', 'stored-key')).toBe('fresh-key');
  });

  it('clears the stored value when an explicit empty string is submitted', () => {
    expect(pickSecret('', 'stored-key')).toBe('');
  });
});

describe('secrets.maskSecret (invariant EDGE-1 depends on)', () => {
  it('masks a present secret to the constant sentinel', () => {
    expect(maskSecret('anything')).toBe(SECRET_MASK);
  });

  it('passes empty / whitespace / undefined through unchanged', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('   ')).toBe('   ');
    expect(maskSecret(undefined)).toBe(undefined);
  });
});

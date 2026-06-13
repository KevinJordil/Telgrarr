import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateSettings } = require('../src/settings/validator.js');

// H5.3a (SD-14): publicBaseUrl is a real schema field (type url, rule url, optional).
describe('publicBaseUrl validation', () => {
  const errs = (v) => validateSettings({ publicBaseUrl: v }).filter((e) => e.field === 'publicBaseUrl');
  it('accepts a valid http(s) URL', () => {
    expect(errs('https://telgrarr.example.com')).toEqual([]);
    expect(errs('http://192.0.2.10:3400')).toEqual([]);
  });
  it('allows empty (auto-detect from request)', () => {
    expect(errs('')).toEqual([]);
  });
  it('rejects a non-URL or non-http scheme', () => {
    expect(errs('not a url').length).toBe(1);
    expect(errs('ftp://host/path').length).toBe(1);
  });
});

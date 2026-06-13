import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateSettings } = require('../src/settings/validator.js');

// H6 (SD-8): advanced deployment fields validate; trustProxy accepts the documented set.
describe('advanced deployment fields', () => {
  const errs = (patch, key) => validateSettings(patch).filter((e) => e.field === key);
  it('trustProxy accepts empty / true / false / hop-count / IP / CIDR', () => {
    for (const v of ['', 'true', 'false', '1', '2', '10.0.0.1', '192.0.2.0/24']) {
      expect(errs({ trustProxy: v }, 'trustProxy')).toEqual([]);
    }
  });
  it('trustProxy rejects junk', () => {
    expect(errs({ trustProxy: 'yes-please' }, 'trustProxy').length).toBe(1);
    expect(errs({ trustProxy: 'http://x' }, 'trustProxy').length).toBe(1);
  });
  it('corsOrigin accepts a URL or empty, rejects non-URL', () => {
    expect(errs({ corsOrigin: '' }, 'corsOrigin')).toEqual([]);
    expect(errs({ corsOrigin: 'https://app.example.com' }, 'corsOrigin')).toEqual([]);
    expect(errs({ corsOrigin: 'not-a-url' }, 'corsOrigin').length).toBe(1);
  });
  it('cookieSecure accepts only auto / true / false', () => {
    for (const v of ['auto', 'true', 'false']) expect(errs({ cookieSecure: v }, 'cookieSecure')).toEqual([]);
    expect(errs({ cookieSecure: 'maybe' }, 'cookieSecure').length).toBe(1);
  });
});

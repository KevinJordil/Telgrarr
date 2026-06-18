import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isTmdbAuthError, isOmdbAuthError, trip, isTripped, reset } = require('../src/services/provider-breaker.js');

describe('P6.1a — TMDb auth classifier (mirrors connection-tester testTmdb)', () => {
  it('HTTP 401 ⇒ auth', () => { expect(isTmdbAuthError({ response: { status: 401 } })).toBe(true); });
  it('body status_code 7 ⇒ auth', () => { expect(isTmdbAuthError({ response: { status: 404, data: { status_code: 7 } } })).toBe(true); });
  it('body status_code 10 ⇒ auth', () => { expect(isTmdbAuthError({ response: { status: 404, data: { status_code: 10 } } })).toBe(true); });
  it('body status_code 3 ⇒ auth', () => { expect(isTmdbAuthError({ response: { status: 404, data: { status_code: 3 } } })).toBe(true); });
  it('plain 404 ⇒ NOT auth', () => { expect(isTmdbAuthError({ response: { status: 404 } })).toBe(false); });
  it('non-auth body code (25) ⇒ NOT auth', () => { expect(isTmdbAuthError({ response: { status: 429, data: { status_code: 25 } } })).toBe(false); });
  it('network error (no response) ⇒ NOT auth', () => { expect(isTmdbAuthError({ message: 'ETIMEDOUT' })).toBe(false); });
  it('null ⇒ NOT auth', () => { expect(isTmdbAuthError(null)).toBe(false); });
});

describe('P6.1a — OMDb auth classifier (mirrors connection-tester testOmdb)', () => {
  it('Error "Invalid API key!" ⇒ auth', () => { expect(isOmdbAuthError({ Response: 'False', Error: 'Invalid API key!' })).toBe(true); });
  it('case-insensitive ⇒ auth', () => { expect(isOmdbAuthError({ Error: 'invalid api key' })).toBe(true); });
  it('Movie not found ⇒ NOT auth', () => { expect(isOmdbAuthError({ Response: 'False', Error: 'Movie not found!' })).toBe(false); });
  it('Response False without Error ⇒ NOT auth', () => { expect(isOmdbAuthError({ Response: 'False' })).toBe(false); });
  it('null ⇒ NOT auth', () => { expect(isOmdbAuthError(null)).toBe(false); });
});

describe('P6.1a — per-sweep state', () => {
  beforeEach(() => reset());
  it('trip then isTripped is true', () => { trip('tmdb'); expect(isTripped('tmdb')).toBe(true); });
  it('untripped provider is false', () => { expect(isTripped('omdb')).toBe(false); });
  it('providers are independent', () => { trip('tmdb'); expect(isTripped('tmdb')).toBe(true); expect(isTripped('omdb')).toBe(false); });
  it('reset clears all', () => { trip('tmdb'); trip('omdb'); reset(); expect(isTripped('tmdb')).toBe(false); expect(isTripped('omdb')).toBe(false); });
});

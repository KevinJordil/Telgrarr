import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

describe('provider-breaker rate/quota reasons', () => {
  let breaker;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/services/provider-breaker.js')];
    breaker = require('../src/services/provider-breaker.js');
    breaker.reset();
  });

  it('tripRate sets reason "rate" and isTripped reports true', () => {
    breaker.tripRate('tmdb');
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(breaker.getTrippedReason('tmdb')).toBe('rate');
  });

  it('tripQuota sets reason "quota" and isTripped reports true', () => {
    breaker.tripQuota('omdb');
    expect(breaker.isTripped('omdb')).toBe(true);
    expect(breaker.getTrippedReason('omdb')).toBe('quota');
  });

  it('trip() with no reason arg defaults to "auth" (back-compat)', () => {
    breaker.trip('tmdb');
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(breaker.getTrippedReason('tmdb')).toBe('auth');
  });

  it('trip(provider, reason) accepts an explicit reason', () => {
    breaker.trip('omdb', 'quota');
    expect(breaker.getTrippedReason('omdb')).toBe('quota');
  });

  it('getTrippedReason returns null for an untripped provider', () => {
    expect(breaker.getTrippedReason('tmdb')).toBeNull();
  });

  it('reset() clears ALL reasons (auth, rate, quota)', () => {
    breaker.trip('tmdb');
    breaker.tripRate('omdb');
    breaker.tripQuota('tmdb');
    breaker.reset();
    expect(breaker.isTripped('tmdb')).toBe(false);
    expect(breaker.isTripped('omdb')).toBe(false);
    expect(breaker.getTrippedReason('tmdb')).toBeNull();
  });

  it('per-provider independence', () => {
    breaker.tripRate('tmdb');
    expect(breaker.isTripped('omdb')).toBe(false);
    expect(breaker.getTrippedReason('omdb')).toBeNull();
  });

  it('isTmdbRateLimitError detects HTTP 429 only', () => {
    expect(breaker.isTmdbRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(breaker.isTmdbRateLimitError({ response: { status: 401 } })).toBe(false);
    expect(breaker.isTmdbRateLimitError(null)).toBe(false);
  });

  it('isOmdbRateLimitError detects HTTP 429 only', () => {
    expect(breaker.isOmdbRateLimitError({ response: { status: 429 } })).toBe(true);
    expect(breaker.isOmdbRateLimitError({ response: { status: 200 } })).toBe(false);
    expect(breaker.isOmdbRateLimitError(undefined)).toBe(false);
  });

  it('isOmdbQuotaExhausted detects the daily-limit body, not a bad-key body', () => {
    expect(breaker.isOmdbQuotaExhausted({ Response: 'False', Error: 'Daily request limit reached!' })).toBe(true);
    expect(breaker.isOmdbQuotaExhausted({ Response: 'False', Error: 'Invalid API key!' })).toBe(false);
    expect(breaker.isOmdbQuotaExhausted(null)).toBe(false);
  });
});

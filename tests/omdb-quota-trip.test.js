import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

describe('omdb.js quota-exhaustion trip (BLR Phase 3: free-tier daily cap)', () => {
  let breaker;

  function stubQuota() {
    stub('axios', {
      get: async () => ({ data: { Response: 'False', Error: 'Daily request limit reached!' } }),
    });
  }

  function stubAuth() {
    stub('axios', {
      get: async () => ({ data: { Response: 'False', Error: 'Invalid API key!' } }),
    });
  }

  function stubSuccess() {
    stub('axios', {
      get: async () => ({ data: { Response: 'True', Title: 'The Shawshank Redemption', imdbRating: '9.3' } }),
    });
  }

  beforeEach(() => {
    stub('../src/config.js', { omdb: { apiKey: 'test-key' } });
    stub('../src/logger.js', { error: () => {}, info: () => {}, warn: () => {}, audit: () => {} });
    delete require.cache[require.resolve('../src/services/provider-breaker.js')];
    delete require.cache[require.resolve('../src/omdb.js')];
    breaker = require('../src/services/provider-breaker.js');
    breaker.reset();
  });

  it('the daily-limit body trips reason "quota" (distinct from "auth")', async () => {
    stubQuota();
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toBeNull();
    expect(breaker.isTripped('omdb')).toBe(true);
    expect(breaker.getTrippedReason('omdb')).toBe('quota');
  });

  it('a bad-key body still trips "auth", never misclassified as "quota"', async () => {
    stubAuth();
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toBeNull();
    expect(breaker.getTrippedReason('omdb')).toBe('auth');
  });

  it('once quota-tripped, isTripped guard short-circuits the next call', async () => {
    stubQuota();
    const omdb = require('../src/omdb.js');
    await omdb.getOmdbById('tt0111161');
    const second = await omdb.getOmdbById('tt0111161');
    expect(second).toBeNull();
    expect(breaker.getTrippedReason('omdb')).toBe('quota');
  });

  it('a normal success response is unaffected (parity) — no trip, data returned', async () => {
    stubSuccess();
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toEqual({ Response: 'True', Title: 'The Shawshank Redemption', imdbRating: '9.3' });
    expect(breaker.isTripped('omdb')).toBe(false);
  });
});

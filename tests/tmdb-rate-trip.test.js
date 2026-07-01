import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

describe('tmdb.js rate-limit trip (BLR Phase 3 / C-6: volumetric 429)', () => {
  let axiosCalls;
  let breaker;

  function stub429() {
    stub('axios', {
      get: async () => {
        axiosCalls += 1;
        const err = new Error('Too Many Requests');
        err.response = { status: 429 };
        throw err;
      },
    });
  }

  function stub401() {
    stub('axios', {
      get: async () => {
        axiosCalls += 1;
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { status_code: 7 } };
        throw err;
      },
    });
  }

  beforeEach(() => {
    axiosCalls = 0;
    stub429();
    stub('../src/config.js', { tmdb: { apiKey: 'test-key' } });
    stub('../src/logger.js', { error: () => {}, info: () => {}, warn: () => {}, audit: () => {} });
    delete require.cache[require.resolve('../src/services/provider-breaker.js')];
    delete require.cache[require.resolve('../src/tmdb.js')];
    breaker = require('../src/services/provider-breaker.js');
    breaker.reset();
  });

  it('a 429 trips the breaker with reason "rate" (not "auth")', async () => {
    const tmdb = require('../src/tmdb.js');
    const result = await tmdb.getTmdbMovieById(1);
    expect(result).toBeNull();
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(breaker.getTrippedReason('tmdb')).toBe('rate');
  });

  it('once rate-tripped, a subsequent call short-circuits (no second HTTP hit)', async () => {
    const tmdb = require('../src/tmdb.js');
    await tmdb.getTmdbSeriesById(2);
    expect(axiosCalls).toBe(1);
    const second = await tmdb.getTmdbSeriesById(3);
    expect(second).toBeNull();
    expect(axiosCalls).toBe(1);
  });

  it('a 401 (auth failure) still trips reason "auth" — no regression from the rate-trip addition', async () => {
    stub401();
    delete require.cache[require.resolve('../src/tmdb.js')];
    const tmdb = require('../src/tmdb.js');
    await tmdb.getTmdbMovieById(4);
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(breaker.getTrippedReason('tmdb')).toBe('auth');
  });

  it('getTmdbTranslations also trips "rate" on 429', async () => {
    const tmdb = require('../src/tmdb.js');
    const result = await tmdb.getTmdbTranslations(5, 'movie');
    expect(result).toBeNull();
    expect(breaker.getTrippedReason('tmdb')).toBe('rate');
  });
});

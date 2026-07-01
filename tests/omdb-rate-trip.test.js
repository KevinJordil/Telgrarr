import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

describe('omdb.js rate-limit trip (BLR Phase 3 / C-6: volumetric 429)', () => {
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

  function stubNetworkError() {
    stub('axios', {
      get: async () => {
        axiosCalls += 1;
        throw new Error('ECONNRESET');
      },
    });
  }

  function stubAuthFail() {
    stub('axios', {
      get: async () => {
        axiosCalls += 1;
        return { data: { Response: 'False', Error: 'Invalid API key!' } };
      },
    });
  }

  beforeEach(() => {
    axiosCalls = 0;
    stub429();
    stub('../src/config.js', { omdb: { apiKey: 'test-key' } });
    stub('../src/logger.js', { error: () => {}, info: () => {}, warn: () => {}, audit: () => {} });
    delete require.cache[require.resolve('../src/services/provider-breaker.js')];
    delete require.cache[require.resolve('../src/omdb.js')];
    breaker = require('../src/services/provider-breaker.js');
    breaker.reset();
  });

  it('a thrown 429 trips the breaker with reason "rate" (not "auth")', async () => {
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toBeNull();
    expect(breaker.isTripped('omdb')).toBe(true);
    expect(breaker.getTrippedReason('omdb')).toBe('rate');
  });

  it('once rate-tripped, a subsequent call short-circuits (no second HTTP hit)', async () => {
    const omdb = require('../src/omdb.js');
    await omdb.getOmdbById('tt0111161');
    expect(axiosCalls).toBe(1);
    const second = await omdb.getOmdbById('tt0111161');
    expect(second).toBeNull();
    expect(axiosCalls).toBe(1);
  });

  it('a non-429 thrown error does NOT trip the breaker (no regression — stays transient)', async () => {
    stubNetworkError();
    delete require.cache[require.resolve('../src/omdb.js')];
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toBeNull();
    expect(breaker.isTripped('omdb')).toBe(false);
  });

  it('the existing 200/"Invalid API key!" auth path still trips reason "auth" (no regression)', async () => {
    stubAuthFail();
    delete require.cache[require.resolve('../src/omdb.js')];
    const omdb = require('../src/omdb.js');
    const result = await omdb.getOmdbById('tt0111161');
    expect(result).toBeNull();
    expect(breaker.getTrippedReason('omdb')).toBe('auth');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

describe('tmdb.js axios timeout (BLR Phase 3 / C-5: no timeout stalls the sweep)', () => {
  let calls;

  beforeEach(() => {
    calls = [];
    stub('axios', {
      get: async (url, opts) => {
        calls.push({ url, opts });
        return { data: { id: 1 } };
      },
    });
    stub('../src/config.js', { tmdb: { apiKey: 'test-key' } });
    stub('../src/logger.js', { error: () => {}, info: () => {}, warn: () => {}, audit: () => {} });
    delete require.cache[require.resolve('../src/services/provider-breaker.js')];
    delete require.cache[require.resolve('../src/tmdb.js')];
    const breaker = require('../src/services/provider-breaker.js');
    breaker.reset();
  });

  it('getTmdbMovieById passes timeout:10000', async () => {
    const tmdb = require('../src/tmdb.js');
    await tmdb.getTmdbMovieById(603);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.timeout).toBe(10000);
  });

  it('getTmdbSeriesById passes timeout:10000', async () => {
    const tmdb = require('../src/tmdb.js');
    await tmdb.getTmdbSeriesById(1399);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.timeout).toBe(10000);
  });

  it('getTmdbTranslations passes timeout:10000', async () => {
    const tmdb = require('../src/tmdb.js');
    await tmdb.getTmdbTranslations(1399, 'tv');
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.timeout).toBe(10000);
  });

  it('success path still returns res.data unchanged (parity)', async () => {
    const tmdb = require('../src/tmdb.js');
    const result = await tmdb.getTmdbMovieById(603);
    expect(result).toEqual({ id: 1 });
  });
});

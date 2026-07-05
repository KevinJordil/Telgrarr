import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
describe('radarr.js axios timeout (FAR F3c: no timeout stalls the sweep)', () => {
  let calls;
  let errorLogs;
  beforeEach(() => {
    calls = [];
    errorLogs = [];
    stub('axios', {
      get: async (url, opts) => {
        calls.push({ url, opts });
        return { data: { id: 1, title: 'Test Movie' } };
      },
    });
    stub('../src/config.js', { radarr: { baseUrl: 'http://radarr.local:7878', apiKey: 'test-key' } });
    stub('../src/logger.js', {
      error: (...args) => errorLogs.push(args),
      info: () => {}, warn: () => {}, audit: () => {},
    });
    delete require.cache[require.resolve('../src/radarr.js')];
  });

  it('getMovieById passes timeout:15000', async () => {
    const radarr = require('../src/radarr.js');
    await radarr.getMovieById(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.timeout).toBe(15000);
  });

  it('preserves the X-Api-Key header (parity)', async () => {
    const radarr = require('../src/radarr.js');
    await radarr.getMovieById(42);
    expect(calls[0].opts.headers).toEqual({ 'X-Api-Key': 'test-key' });
  });

  it('success path still returns res.data unchanged (parity)', async () => {
    const radarr = require('../src/radarr.js');
    const result = await radarr.getMovieById(42);
    expect(result).toEqual({ id: 1, title: 'Test Movie' });
  });

  it('error path still logs and throws (parity, incl. timeout errors)', async () => {
    require.cache[require.resolve('axios')].exports.get = async () => {
      const err = new Error('timeout of 15000ms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    };
    const radarr = require('../src/radarr.js');
    await expect(radarr.getMovieById(42)).rejects.toThrow('timeout of 15000ms exceeded');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0][0]).toBe('Radarr');
    expect(errorLogs[0][1]).toContain('Movie ID: [42]');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
describe('sonarr.js axios timeout (FAR F3b: no timeout stalls the sweep)', () => {
  let calls;
  let errorLogs;
  beforeEach(() => {
    calls = [];
    errorLogs = [];
    stub('axios', {
      get: async (url, opts) => {
        calls.push({ url, opts });
        return { data: { id: 1, title: 'Test Series' } };
      },
    });
    stub('../src/config.js', { sonarr: { baseUrl: 'http://sonarr.local:8989', apiKey: 'test-key' } });
    stub('../src/logger.js', {
      error: (...args) => errorLogs.push(args),
      info: () => {}, warn: () => {}, audit: () => {},
    });
    delete require.cache[require.resolve('../src/sonarr.js')];
  });

  it('getSeriesById passes timeout:15000', async () => {
    const sonarr = require('../src/sonarr.js');
    await sonarr.getSeriesById(42);
    expect(calls).toHaveLength(1);
    expect(calls[0].opts.timeout).toBe(15000);
  });

  it('preserves the X-Api-Key header (parity)', async () => {
    const sonarr = require('../src/sonarr.js');
    await sonarr.getSeriesById(42);
    expect(calls[0].opts.headers).toEqual({ 'X-Api-Key': 'test-key' });
  });

  it('success path still returns res.data unchanged (parity)', async () => {
    const sonarr = require('../src/sonarr.js');
    const result = await sonarr.getSeriesById(42);
    expect(result).toEqual({ id: 1, title: 'Test Series' });
  });

  it('error path still logs and throws (parity, incl. timeout errors)', async () => {
    require.cache[require.resolve('axios')].exports.get = async () => {
      const err = new Error('timeout of 15000ms exceeded');
      err.code = 'ECONNABORTED';
      throw err;
    };
    const sonarr = require('../src/sonarr.js');
    await expect(sonarr.getSeriesById(42)).rejects.toThrow('timeout of 15000ms exceeded');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0][0]).toBe('Sonarr');
    expect(errorLogs[0][1]).toContain('Series ID: [42]');
  });
});

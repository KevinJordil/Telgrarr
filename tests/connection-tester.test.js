import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';

// Load BOTH axios and the tester via the SAME native require.
// Node caches axios as a singleton, so this `axios` is the exact object the
// tester's internal `require('axios')` holds. Spying on its methods therefore
// intercepts the tester's real calls — no vi.mock / ESM-CJS interop involved.
const require = createRequire(import.meta.url);
const axios = require('axios');
const tester = require('../src/services/connection-tester.js');

const probes = Object.keys(tester).filter(k => typeof tester[k] === 'function');

describe('Connection Tester Parity Harness (Phase A.5)', () => {
  afterEach(() => {
    vi.restoreAllMocks(); // restore real axios.get/post after every test
  });

  it('exports exactly 9 pure probes', () => {
    expect(probes.length, `Expected 9 probes, found ${probes.length}: ${probes.join(', ')}`).toBe(9);
  });

  const probeArgs = {
    testTelegram: ['123456789:AAExxx', '-100123456'],
    testSonarr: ['http://127.0.0.1:8989', 'sonarrkey'],
    testRadarr: ['http://127.0.0.1:7878', 'radarrkey'],
    testEmby: ['http://127.0.0.1:8096/Library/Refresh', 'embykey'],
    testOmdb: ['omdbkey'],
    testTmdb: ['tmdbkey'],
    testTranslatorAi: ['https://api.openai.com/v1/chat/completions', 'gpt-4o-mini', 'aikey'],
    testSeerr: ['https://seerr.example'],
      testTranslatorDeepl: ['deeplkey']
  };

  describe.each(probes)('Probe Contract: %s', (probeName) => {
    it('contract: network failure -> { success: false, error: string }', async () => {
      const err = new Error('Network Unreachable');
      vi.spyOn(axios, 'get').mockRejectedValue(err);
      vi.spyOn(axios, 'post').mockRejectedValue(err);

      const result = await tester[probeName](...(probeArgs[probeName] || []));

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error.trim().length).toBeGreaterThan(0);
      expect(result.message).toBeUndefined();
    });

    it('contract: valid response -> exact success shape', async () => {
      const payload = {
        data: {
          version: '3.0.0',
          appName: 'MockApp',
          Response: 'True',
          ok: true,
          result: { username: 'test_bot', first_name: 'bot' },
          choices: [{ message: { content: 'Success content from AI' } }],
          character_count: 150,
          character_limit: 500000
        },
        status: 200
      };
      vi.spyOn(axios, 'get').mockResolvedValue(payload);
      vi.spyOn(axios, 'post').mockResolvedValue(payload);

      const result = await tester[probeName](...(probeArgs[probeName] || []));

      expect(result.success, `Probe failed with error: ${result.error}`).toBe(true);
      expect(result.error).toBeUndefined();

      if (probeName === 'testSonarr' || probeName === 'testRadarr') {
        expect(typeof result.version).toBe('string');
        expect(typeof result.appName).toBe('string');
      } else if (probeName === 'testSeerr') {
        expect(typeof result.version).toBe('string');
      } else if (probeName === 'testTranslatorDeepl') {
        expect(typeof result.character_count).toBe('number');
        expect(typeof result.character_limit).toBe('number');
      } else {
        expect(typeof result.message).toBe('string');
      }
    });
  });

  it('testTmdb: 401 invalid-key body classifies as Invalid API key', async () => {
    const err = new Error('Request failed with status code 401');
    err.response = { status: 401, data: { status_code: 7, status_message: 'Invalid API key' } };
    vi.spyOn(axios, 'get').mockRejectedValue(err);
    const result = await tester.testTmdb('badkey');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API key');
  });

  it('testOmdb: invalid-key body classifies as Invalid API key', async () => {
    const payload = { data: { Response: 'False', Error: 'Invalid API key!' }, status: 200 };
    vi.spyOn(axios, 'get').mockResolvedValue(payload);
    const result = await tester.testOmdb('badkey');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid API key');
  });
});

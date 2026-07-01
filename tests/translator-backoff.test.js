import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

// [BLR Phase 2 / SD-1] Post-Phase-2 translator cascade retry contract:
//   - 5xx / network error within a tier => RETRY inside the tier
//   - 429 / provider-quota => ESCALATE (no retry; cooldown set)
// This suite covers ONLY the retry-still-works half. The escalate-on-429
// and escalate-on-quota assertions live in translator-cascade-429.test.js
// and translator-cascade-quota.test.js.

const LLM_OK    = { data: { choices: [{ message: { content: 'ai-out' } }] } };
const DEEPL_OK  = { data: { translations: [{ text: 'deepl-out' }] } };
const GOOGLE_OK = { data: [[[ 'google-out' ]]] };

function apiError(status, opts = {}) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data: opts.data || {}, headers: opts.headers || {} };
  return e;
}
function netError(code) {
  const e = new Error(`network ${code}`);
  e.code = code;
  return e;
}

describe('translator retry-on-transient (BLR Phase 2 / SD-1: 5xx + network still retry)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('T1: 503 once → retries and succeeds at Tier 1 (5xx retryable)', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('T1: ECONNRESET once → retries and succeeds (network retryable)', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(netError('ECONNRESET'))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('T1: non-retryable 401 → immediate escalation, no retry burn', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(401, { data: { error: { message: 'unauthorized' } } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2);   // 1 T1 + 1 T2
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('T2: 503 once → retries and succeeds at Tier 2', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue(DEEPL_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('T2: non-retryable 403 → immediate escalation to T3, no cooldown', async () => {
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(403, { data: { message: 'forbidden' } }));
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello')).toBe('google-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);   // T2 (authenticated) stricter semantics NOT applied
  });

  it('T3 (no key): 503 once → retries and succeeds at Tier 3 (retry within tier)', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get')
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue(GOOGLE_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-out');
    expect(get).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });
});

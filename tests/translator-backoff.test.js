import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config.js');
const { translateText } = require('../src/translator.js');

// Mirrors the LLM_OK / DEEPL_OK / GOOGLE_OK fixtures from translator-tiers.test.js
// (parity oracle: same response shapes, same translateText API).
const LLM_OK    = { data: { choices: [{ message: { content: 'ai-out' } }] } };
const DEEPL_OK  = { data: { translations: [{ text: 'deepl-out' }] } };
const GOOGLE_OK = { data: [[[ 'google-out' ]]] };
const GOOGLE_API_OK = { data: { data: { translations: [{ translatedText: 'google-api-out' }] } } };

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

describe('translator retry-on-429/transient (STEP 1.3 / WR-10 / C-GUARD)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; });
  afterEach(() => { config.translator = orig; vi.restoreAllMocks(); vi.useRealTimers(); });

  // ─────────── Tier 1 (AI/LLM) ───────────

  it('T1: 429 once then succeeds → returns Tier 1 output, no escalation', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(429, { headers: { 'retry-after': '1' } }))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('T1: persistent 429 → escalates to Tier 2 (DeepL)', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(429, { headers: { 'retry-after': '1' } });
    });
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(5); // 4 T1 attempts + 1 T2
  });

  it('T1: non-retryable 401 → immediate escalation (parity: single T1 call)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(401, { data: { error: { message: 'unauthorized' } } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2); // 1 T1 + 1 T2 (no retry)
  });

  it('T1: 503 once → retries and succeeds at Tier 1', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('T1: ECONNRESET once → retries and succeeds', async () => {
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

  // ─────────── Tier 2 (DeepL) ───────────

  it('T2: 429 once then succeeds → no escalation to T3', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(429, { headers: { 'retry-after': '1' } }))
      .mockResolvedValue(DEEPL_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('T2: persistent 429 → escalates to Tier 3 (Google)', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(429, { headers: { 'retry-after': '1' } }));
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-out');
    expect(post).toHaveBeenCalledTimes(4);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('T2: non-retryable 403 → immediate escalation (parity: single T2 call)', async () => {
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(403, { data: { message: 'forbidden' } }));
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello')).toBe('google-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });

  // ─────────── Tier 3 (Google, no-key path) ───────────

  it('T3 (no key): 429 once then succeeds', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get')
      .mockRejectedValueOnce(apiError(429, { headers: { 'retry-after': '1' } }))
      .mockResolvedValue(GOOGLE_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-out');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('T3 (no key): non-retryable 404 → degrades to fallback (parity: single call)', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get').mockRejectedValue(apiError(404));
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('T3 (no key): persistent 429 → degrades to fallback after retries', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get').mockRejectedValue(apiError(429, { headers: { 'retry-after': '1' } }));
    const p = translateText('Hello', { fallback: 'FB' });
    await vi.runAllTimersAsync();
    expect(await p).toBe('FB');
    expect(get).toHaveBeenCalledTimes(4);
  });

  // ─────────── Tier 3 (Google, with-key path) ───────────

  it('T3 (with key): 429 once then succeeds', async () => {
    vi.useFakeTimers();
    config.translator = {
      aiEnabled: false, deeplEnabled: false,
      googleApiKey: 'g', googleEndpoint: 'https://google-api.test/translate',
    };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(429, { headers: { 'retry-after': '1' } }))
      .mockResolvedValue(GOOGLE_API_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-api-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  // ─────────── Retry-After header parsing ───────────

  it('Retry-After header in seconds is honored', async () => {
    vi.useFakeTimers();
    // Pin random=0 to zero out retry.js additive jitter; wait becomes exactly
    // retry_after*1000 = 5000ms (literal-honor contract per WR-15/C-GUARD).
    vi.spyOn(Math, 'random').mockReturnValue(0);
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(429, { headers: { 'retry-after': '5' } }))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    // Below the literal: retry must NOT have fired (proves "never shorter").
    await vi.advanceTimersByTimeAsync(4999);
    expect(post).toHaveBeenCalledTimes(1);
    // At the literal: retry fires (proves seconds->ms: header '5' == 5000ms).
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('Missing Retry-After on 429 falls back to exponential backoff', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

// [BLR Phase 2 coverage restoration] The Phase-2 rewrite of
// translator-backoff.test.js dropped three assertions covering STILL-LIVE
// production code: getTranslatorRetryAfterMs seconds->ms + literal-honor floor,
// the missing-header exponential-backoff fallback, and the authenticated Google
// Cloud Translate response-parse. 429 no longer retries post-Phase-2, so the
// Retry-After vehicle is a retryable 5xx (getRetryAfterMs is status-agnostic:
// it reads the header for any error that carries one). Verified against
// src/utils/retry.js waitMsFor (literal honor, uncapped; additive jitter only).

const LLM_OK        = { data: { choices: [{ message: { content: 'ai-out' } }] } };
const GOOGLE_API_OK = { data: { data: { translations: [{ translatedText: 'google-api-out' }] } } };

function apiError(status, opts = {}) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data: opts.data || {}, headers: opts.headers || {} };
  return e;
}

describe('translator Retry-After honor + backoff fallback + authenticated parse (BLR Phase 2 coverage restoration)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('Retry-After (seconds) honored LITERALLY on a retryable 5xx — does not fire before the literal, fires exactly at it', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);   // zero additive jitter => wait === literal
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503, { headers: { 'retry-after': '5' } }))
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.advanceTimersByTimeAsync(4999);       // below 5000ms: retry must NOT have fired
    expect(post).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);          // at 5000ms: header '5' => 5000ms, retry fires
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);   // success-after-retry leaves no cooldown
  });

  it('missing Retry-After on a retryable 5xx => exponential-backoff fallback still retries', async () => {
    vi.useFakeTimers();
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503))        // no headers => getTranslatorRetryAfterMs returns undefined
      .mockResolvedValue(LLM_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('authenticated Google Cloud path (googleApiKey set) parses translatedText on happy path', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'g', googleEndpoint: 'https://google-api.test/translate' };
    const post = vi.spyOn(axios, 'post').mockResolvedValue(GOOGLE_API_OK);
    expect(await translateText('Hello')).toBe('google-api-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });

  it('authenticated Google Cloud path: 503 once => retries within tier and succeeds (retry survives on the with-key path; 5xx is NOT a cooldown trigger)', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'g', googleEndpoint: 'https://google-api.test/translate' };
    const post = vi.spyOn(axios, 'post')
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue(GOOGLE_API_OK);
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-api-out');
    expect(post).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });
});

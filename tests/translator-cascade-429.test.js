import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

const DEEPL_OK  = { data: { translations: [{ text: 'deepl-out' }] } };
const GOOGLE_OK = { data: [[[ 'google-out' ]]] };

function apiError(status, opts = {}) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data: opts.data || {}, headers: opts.headers || {} };
  return e;
}

describe('translator cascade 429 escalation (BLR Phase 2 / SD-1)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); });

  it('T1 429 → escalate IMMEDIATELY (1 T1 + 1 T2 call — NO retry burn)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(429, { headers: { 'retry-after': '30' } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
  });

  it('T1 429 → subsequent call skips T1 entirely (cooldown honored)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    let t1Calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      t1Calls++;
      throw apiError(429, { headers: { 'retry-after': '30' } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(t1Calls).toBe(1);
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(t1Calls).toBe(1);   // T1 skipped on second call
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
  });

  it('T2 429 → escalate to T3 (1 T2 + 1 T3 call, tier2 cooldown set)', async () => {
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(429, { headers: { 'retry-after': '30' } }));
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello')).toBe('google-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier2')).toBe(true);
  });

  it('T3 (no key) 429 → cooldown set, fallback returned (1 call, no retry)', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get').mockRejectedValue(apiError(429, { headers: { 'retry-after': '30' } }));
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(get).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });
});

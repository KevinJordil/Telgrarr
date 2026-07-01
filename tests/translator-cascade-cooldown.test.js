import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

const LLM_OK   = { data: { choices: [{ message: { content: 'ai-out' } }] } };
const DEEPL_OK = { data: { translations: [{ text: 'deepl-out' }] } };

function apiError(status, opts = {}) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data: opts.data || {}, headers: opts.headers || {} };
  return e;
}

describe('translator cooldown expiry restores tier (BLR Phase 2)', () => {
  let orig;
  beforeEach(() => {
    orig = config.translator;
    cooldown.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => {
    config.translator = orig;
    cooldown.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tier1 skipped while cooling, tried again once cooldown expires', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    let t1Calls = 0;
    vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      t1Calls++;
      throw apiError(429, { headers: { 'retry-after': '30' } });
    });

    expect(await translateText('Hello')).toBe('deepl-out');
    expect(t1Calls).toBe(1);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(t1Calls).toBe(1);   // still cooling, T1 skipped

    await vi.advanceTimersByTimeAsync(16_000);   // now past 30s window
    vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      t1Calls++;
      return LLM_OK;
    });
    expect(await translateText('Hello')).toBe('ai-out');
    expect(t1Calls).toBe(2);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('quota cooldown (tier2, pinned at MAX_COOLDOWN_MS) expires and tier2 is retried', async () => {
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockRejectedValue(apiError(456));
    vi.spyOn(axios, 'get').mockResolvedValue({ data: [[[ 'google-out' ]]] });

    expect(await translateText('Hello')).toBe('google-out');
    expect(cooldown.isCoolingDown('tier2')).toBe(true);

    await vi.advanceTimersByTimeAsync(cooldown.MAX_COOLDOWN_MS - 1);
    expect(cooldown.isCoolingDown('tier2')).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);

    vi.spyOn(axios, 'post').mockResolvedValue(DEEPL_OK);
    expect(await translateText('Hello')).toBe('deepl-out');
  });
});

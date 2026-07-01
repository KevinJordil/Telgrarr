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

describe('translator quota escalation (BLR Phase 2 / DEC-BLR-6)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); });

  it('T1 OpenAI insufficient_quota → escalate + tier1 quota cooldown', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(429, { data: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(2);   // 1 T1 + 1 T2 — no retry burn on quota
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
  });

  it('T1 quota-by-message-match (no code field) → escalate + tier1 quota cooldown', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(429, { data: { error: { message: 'Rate limit reached for requests: quota exceeded' } } });
    });
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
  });

  it('T2 DeepL 456 (documented quota-exceeded code) → escalate + tier2 quota cooldown, no retry burn', async () => {
    config.translator = { aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(456, { data: { message: 'Quota exceeded.' } }));
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello')).toBe('google-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier2')).toBe(true);
  });

  it('T3 Google quotaExceeded (403, authenticated key path) → escalate + tier3 quota cooldown', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'gk' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(
      apiError(403, { data: { error: { errors: [{ reason: 'quotaExceeded' }] } } })
    );
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(post).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('T3 Google userRateLimitExceeded (403) → escalate + tier3 quota cooldown', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'gk' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(
      apiError(403, { data: { error: { errors: [{ reason: 'userRateLimitExceeded' }] } } })
    );
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(post).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('per-tier quota independence: tripping tier1 quota does not affect tier2/tier3', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockImplementation(async (url) => {
      if (url.includes('deepl')) return DEEPL_OK;
      throw apiError(429, { data: { error: { code: 'insufficient_quota' } } });
    });
    await translateText('Hello');
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });
});

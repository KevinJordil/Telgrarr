import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

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

describe('translator Tier 3 (gtx) hardened cooldown (BLR SD-2)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it('single-shot non-retryable non-2xx (401) trips tier3 cooldown immediately, no retry burn', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get').mockRejectedValue(apiError(401));
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(get).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('authenticated path (googleApiKey set), non-retryable 401 with no quota signature DOES trip cooldown at MAX (BCS SD-3 supersedes DEC-BLR-8 scope for 401/403: authenticated Google Cloud path now sidelines on auth failure, matching Tiers 1/2 auth symmetry)', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'gk' };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(apiError(401));
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(post).toHaveBeenCalledTimes(1);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);   // [BCS T1] authed 401 => MAX cooldown
  });

  it('persistent 5xx exhausts in-tier retries (maxAttempts=4), THEN trips tier3 cooldown', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get').mockRejectedValue(apiError(500));
    const p = translateText('Hello', { fallback: 'FB' });
    await vi.runAllTimersAsync();
    expect(await p).toBe('FB');
    expect(get).toHaveBeenCalledTimes(4);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('network error (ECONNRESET, no HTTP status) does NOT trip tier3 cooldown — retried within tier, not escalated', async () => {
    vi.useFakeTimers();
    config.translator = { aiEnabled: false, deeplEnabled: false };
    const get = vi.spyOn(axios, 'get')
      .mockRejectedValueOnce(netError('ECONNRESET'))
      .mockResolvedValue({ data: [[[ 'google-out' ]]] });
    const p = translateText('Hello');
    await vi.runAllTimersAsync();
    expect(await p).toBe('google-out');
    expect(get).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });

  it('code-thrown validation error (no err.response) does NOT trip tier3 cooldown', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false };
    vi.spyOn(axios, 'get').mockResolvedValue({ data: null });
    await translateText('Hello', { fallback: 'FB' });
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });
});

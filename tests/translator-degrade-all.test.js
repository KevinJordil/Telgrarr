import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

describe('translator Tier 4 graceful degradation when all tiers cooled (BLR Phase 2)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; cooldown.clear(); });
  afterEach(()  => { config.translator = orig; cooldown.clear(); vi.restoreAllMocks(); });

  it('all 3 tiers cooling down => zero network calls, returns fallback (Tier 4)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd', googleApiKey: 'g' };
    cooldown.noteRateLimit('tier1', 60_000);
    cooldown.noteQuotaExhausted('tier2');
    cooldown.noteRateLimit('tier3', 60_000);

    const post = vi.spyOn(axios, 'post');
    const get  = vi.spyOn(axios, 'get');

    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('all 3 tiers cooling down, no fallback option passed => Tier 4 returns null (verified contract: return fallback; default null)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd', googleApiKey: 'g' };
    cooldown.noteRateLimit('tier1', 60_000);
    cooldown.noteQuotaExhausted('tier2');
    cooldown.noteRateLimit('tier3', 60_000);
    expect(await translateText('Hello World')).toBeNull();
  });

  it('mixed: tier1+tier2 cooled, tier3 clear => tier3 still attempted (degradation is per-attempt, not all-or-nothing)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd' };
    cooldown.noteRateLimit('tier1', 60_000);
    cooldown.noteQuotaExhausted('tier2');
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: [[[ 'google-out' ]]] });
    expect(await translateText('Hello')).toBe('google-out');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config.js');
const { translateText } = require('../src/translator.js');

// P2.2 / DEC-8: Tier 3 promotes to the official Google Cloud Translation v2
// API when a key is set; with no key it uses the keyless fallback (unchanged).
// AI + DeepL disabled so the cascade lands deterministically on Tier 3.
const GOOGLE_V2_OK = { data: { data: { translations: [{ translatedText: 'google-v2-out' }] } } };
const KEYLESS_OK   = { data: [[[ 'keyless-out' ]]] };

describe('Tier-3 Google official vs keyless (P2.2 / DEC-8)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; });
  afterEach(() => { config.translator = orig; vi.restoreAllMocks(); });

  it('with googleApiKey -> official v2 POST path', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false, googleApiKey: 'AIza' + 'x'.repeat(35) };
    const post = vi.spyOn(axios, 'post').mockResolvedValue(GOOGLE_V2_OK);
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(KEYLESS_OK);
    expect(await translateText('Hello')).toBe('google-v2-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain('googleapis.com');
    expect(get).not.toHaveBeenCalled();
  });

  it('without googleApiKey -> keyless GET fallback (unchanged)', async () => {
    config.translator = { aiEnabled: false, deeplEnabled: false };
    vi.spyOn(axios, 'post').mockResolvedValue(GOOGLE_V2_OK);
    const get = vi.spyOn(axios, 'get').mockResolvedValue(KEYLESS_OK);
    expect(await translateText('Hello')).toBe('keyless-out');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toContain('translate_a/single');
  });
});

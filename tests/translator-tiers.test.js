import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config.js');
const { translateText } = require('../src/translator.js');
const logger = require('../src/logger.js');

// P2.1 / DEC-8: per-tier enable toggles. Undefined (default) keeps every tier
// active -> parity; an explicit false skips that tier in the cascade.
const LLM_OK    = { data: { choices: [{ message: { content: 'ai-out' } }] } };
const DEEPL_OK  = { data: { translations: [{ text: 'deepl-out' }] } };
const GOOGLE_OK = { data: [[[ 'google-out' ]]] };

describe('translator per-tier toggles (P2.1 / DEC-8)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; });
  afterEach(() => { config.translator = orig; vi.restoreAllMocks(); });

  it('default (no toggles) keeps Tier 1 active (parity)', async () => {
    config.translator = { apiKey: 'k' };
    const post = vi.spyOn(axios, 'post').mockResolvedValue(LLM_OK);
    expect(await translateText('Hello')).toBe('ai-out');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('aiEnabled:false skips Tier 1 -> falls to DeepL', async () => {
    config.translator = { apiKey: 'k', aiEnabled: false, deeplApiKey: 'd' };
    const post = vi.spyOn(axios, 'post').mockResolvedValue(DEEPL_OK);
    expect(await translateText('Hello')).toBe('deepl-out');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain('deepl');
  });

  it('deeplEnabled:false skips Tier 2 -> falls to Google', async () => {
    config.translator = { deeplApiKey: 'd', deeplEnabled: false };
    const post = vi.spyOn(axios, 'post').mockResolvedValue(DEEPL_OK);
    const get  = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello')).toBe('google-out');
    expect(post).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('googleEnabled:false with no keys skips all tiers -> fallback', async () => {
    config.translator = { googleEnabled: false };
    const get = vi.spyOn(axios, 'get').mockResolvedValue(GOOGLE_OK);
    expect(await translateText('Hello', { fallback: 'FB' })).toBe('FB');
    expect(get).not.toHaveBeenCalled();
  });

  it('FA-34: aiEnabled:false logs an explicit Tier 1 skip reason (disabled) -- return value unaffected (parity)', async () => {
    config.translator = { apiKey: 'k', aiEnabled: false, deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockResolvedValue(DEEPL_OK);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(await translateText('Hello')).toBe('deepl-out');
    const tier1SkipCalls = warnSpy.mock.calls.filter(
      ([, msg]) => msg.includes('Tier 1 (AI)') && msg.includes('disabled')
    );
    expect(tier1SkipCalls).toHaveLength(1);
  });

  it('FA-34: missing apiKey logs an explicit Tier 1 skip reason (apiKey not configured) -- previously silent, return value unaffected (parity)', async () => {
    config.translator = { deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockResolvedValue(DEEPL_OK);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect(await translateText('Hello')).toBe('deepl-out');
    const tier1SkipCalls = warnSpy.mock.calls.filter(
      ([, msg]) => msg.includes('Tier 1 (AI)') && msg.includes('apiKey not configured')
    );
    expect(tier1SkipCalls).toHaveLength(1);
  });
});

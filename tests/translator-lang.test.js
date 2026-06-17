import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config.js');
const { translateText, LANG } = require('../src/translator.js');

const LLM_OK = { data: { choices: [{ message: { content: 'ok' } }] } };
const sysOf = (body) => body.messages.find((m) => m.role === 'system').content;

describe('translateText targetLang (P5.1 — parity at ar)', () => {
  let orig;
  beforeEach(() => { orig = config.translator; config.translator = { apiKey: 'test-key' }; });
  afterEach(() => { config.translator = orig; delete LANG.fr; vi.restoreAllMocks(); });

  it('default and explicit ar yield byte-identical Tier-1 prompts (parity)', async () => {
    const p = [];
    vi.spyOn(axios, 'post').mockImplementation(async (_u, b) => { p.push(sysOf(b)); return LLM_OK; });
    await translateText('Hello');
    await translateText('Hello', { targetLang: 'ar' });
    expect(p[0]).toBe(p[1]);
    expect(p[0]).toContain('professional Arabic');
  });

  it('threads targetLang from the LANG map (seam)', async () => {
    LANG.fr = { name: 'French', deepl: 'FR', google: 'fr' };
    let sys;
    vi.spyOn(axios, 'post').mockImplementation(async (_u, b) => { sys = sysOf(b); return LLM_OK; });
    await translateText('Hello', { targetLang: 'fr' });
    expect(sys).toContain('professional French');
    expect(sys).not.toContain('Arabic');
  });

  it('unknown target falls back to ar', async () => {
    let sys;
    vi.spyOn(axios, 'post').mockImplementation(async (_u, b) => { sys = sysOf(b); return LLM_OK; });
    await translateText('Hello', { targetLang: 'zz' });
    expect(sys).toContain('professional Arabic');
  });
});

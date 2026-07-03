'use strict';
// [BCS Phase 3 / F9] Pin the positional events.emit contract for every
// translator emit site: SUCCESS x3 (info), FAILED x3 (warn), SKIPPED x1
// (warn). Signature: emit(type, level, module, message, data). Prior code
// used emit(type, {payload}); payload landed in level, module/message were
// undefined, data ended up as {}. This suite prevents regression to the
// malformed 2-arg shape.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const TRANSLATOR_PATH = require.resolve('../src/translator.js');
const COOLDOWN_PATH   = require.resolve('../src/translator-cooldown.js');
const EVENTS_PATH     = require.resolve('../src/events.js');
const EVENT_TYPES     = require('../shared/events.json');
const axios           = require('axios');
const config          = require('../src/config.js');

function stub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

let emitted;
let translator;
let cooldown;
let origTranslatorConfig;

beforeEach(() => {
  origTranslatorConfig = config.translator;
  emitted = [];
  const eventsStub = {
    emit(type, level, module, message, data) {
      emitted.push({ type, level, module, message, data });
    },
    emitThrottled() {},
    bus: { on() {}, emit() {}, removeAllListeners() {} },
    getRecentEvents() { return []; },
    loadEvents() {},
    flushEvents() {},
  };
  delete require.cache[TRANSLATOR_PATH];
  delete require.cache[COOLDOWN_PATH];
  delete require.cache[EVENTS_PATH];
  stub(EVENTS_PATH, eventsStub);
  cooldown   = require('../src/translator-cooldown.js');
  translator = require('../src/translator.js');
  cooldown.clear();
  cooldown.resetCycle();
});

afterEach(() => {
  config.translator = origTranslatorConfig;
  vi.restoreAllMocks();
});

describe('[BCS P3 F9] translator emit shape — positional (type, level, module, message, data)', () => {

  it('T1 SUCCESS emits level=info, module=Translator, message contains "1 (AI)", data={tier:1,length}', async () => {
    config.translator = { apiKey: 'k' };
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'Hola' } }] },
    });
    const out = await translator.translateText('Hello', { targetLang: 'es' });
    expect(out).toBe('Hola');
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_SUCCESS);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('info');
    expect(evt.module).toBe('Translator');
    expect(typeof evt.message).toBe('string');
    expect(evt.message.length).toBeGreaterThan(0);
    expect(evt.message).toContain('1 (AI)');
    expect(evt.data).toEqual({ tier: 1, length: 5 });
  });

  it('T2 SUCCESS emits with "2 (DeepL)" in message, data={tier:2,length}', async () => {
    config.translator = { deeplApiKey: 'd' };
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { translations: [{ text: 'Hola' }] },
    });
    const out = await translator.translateText('Hello', { targetLang: 'es' });
    expect(out).toBe('Hola');
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_SUCCESS);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('info');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('2 (DeepL)');
    expect(evt.data).toEqual({ tier: 2, length: 5 });
  });

  it('T3 SUCCESS (authenticated Google Cloud) emits with "3 (Google)" in message, data={tier:3,length}', async () => {
    config.translator = { googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { data: { translations: [{ translatedText: 'Bonjour' }] } },
    });
    const out = await translator.translateText('Hello', { targetLang: 'fr' });
    expect(out).toBe('Bonjour');
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_SUCCESS);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('info');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('3 (Google)');
    expect(evt.data).toEqual({ tier: 3, length: 5 });
  });

  it('T1 FAILED emits level=warn, module=Translator, message contains "Escalating" and "1 (AI)", data={tier:1,error}', async () => {
    config.translator = { apiKey: 'k', deeplEnabled: false, googleEnabled: false };
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('boom-t1'));
    await translator.translateText('Hello', { targetLang: 'es', fallback: 'FB' });
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_FAILED && e.data.tier === 1);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('warn');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('Escalating');
    expect(evt.message).toContain('1 (AI)');
    expect(evt.data).toEqual({ tier: 1, error: 'boom-t1' });
  });

  it('T2 FAILED emits level=warn, tier:2', async () => {
    config.translator = { deeplApiKey: 'd', googleEnabled: false };
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('boom-t2'));
    await translator.translateText('Hello', { targetLang: 'es', fallback: 'FB' });
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_FAILED && e.data.tier === 2);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('warn');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('Escalating');
    expect(evt.message).toContain('2 (DeepL)');
    expect(evt.data).toEqual({ tier: 2, error: 'boom-t2' });
  });

  it('T3 FAILED (authenticated) emits level=warn, tier:3', async () => {
    config.translator = { googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('boom-t3'));
    await translator.translateText('Hello', { targetLang: 'fr', fallback: 'FB' });
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_FAILED && e.data.tier === 3);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('warn');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('Escalating');
    expect(evt.message).toContain('3 (Google)');
    expect(evt.data).toEqual({ tier: 3, error: 'boom-t3' });
  });

  it('SKIPPED (all tiers exhausted) emits level=warn, message contains "All tiers exhausted", data={length}', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd', googleEnabled: false };
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('t-fail'));
    const out = await translator.translateText('Hello', { targetLang: 'es', fallback: 'FB' });
    expect(out).toBe('FB');
    const evt = emitted.find(e => e.type === EVENT_TYPES.TRANSLATOR_SKIPPED);
    expect(evt).toBeDefined();
    expect(evt.level).toBe('warn');
    expect(evt.module).toBe('Translator');
    expect(evt.message).toContain('All tiers exhausted');
    expect(evt.data).toEqual({ length: 5 });
  });

  it('EVERY captured emit has string level + Translator module + non-empty message (rejects 2-arg regression)', async () => {
    config.translator = { apiKey: 'k', deeplApiKey: 'd', googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('all-fail'));
    await translator.translateText('Hello', { targetLang: 'es', fallback: null });
    expect(emitted.length).toBeGreaterThanOrEqual(4); // 3 FAILED + 1 SKIPPED minimum
    for (const e of emitted) {
      expect(typeof e.level).toBe('string');
      expect(['info', 'warn']).toContain(e.level);
      expect(e.module).toBe('Translator');
      expect(typeof e.message).toBe('string');
      expect(e.message.length).toBeGreaterThan(0);
      expect(typeof e.data).toBe('object');
      expect(e.data).not.toBeNull();
    }
    const failedCount  = emitted.filter(e => e.type === EVENT_TYPES.TRANSLATOR_TIER_FAILED).length;
    const skippedCount = emitted.filter(e => e.type === EVENT_TYPES.TRANSLATOR_SKIPPED).length;
    expect(failedCount).toBe(3);
    expect(skippedCount).toBe(1);
  });
});

'use strict';
// [BCS Phase 3 / T1] Pin per-tier authentication-failure sideline symmetric
// with provider-breaker auth-trip semantics — Master §7 [BCS SD-3]: reuse
// cooldown.noteQuotaExhausted as the MAX-pin primitive (R05, no new API).
// A stable auth failure (dead/invalid API key) sidelines the tier for
// MAX_COOLDOWN_MS so a 400-webhook burst does not fire 400 wasted
// round-trips + 400 TIER_FAILED events per dead tier.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios    = require('axios');
const config   = require('../src/config.js');
const cooldown = require('../src/translator-cooldown.js');
const { translateText } = require('../src/translator.js');

function makeErr(status, body) {
  const e = new Error('http ' + status);
  e.response = { status, data: body || {}, headers: {} };
  return e;
}

let origTranslatorConfig;
beforeEach(() => {
  origTranslatorConfig = config.translator;
  cooldown.clear();
  cooldown.resetCycle();
});
afterEach(() => {
  config.translator = origTranslatorConfig;
  vi.restoreAllMocks();
});

describe('[BCS P3 T1] Tier 1 (AI/OpenAI) 401 => MAX cooldown', () => {
  it('single 401 sidelines T1 at MAX_COOLDOWN_MS; second call skips T1 at entry', async () => {
    config.translator = { apiKey: 'k', deeplEnabled: false, googleEnabled: false };
    const spy = vi.spyOn(axios, 'post').mockRejectedValue(
      makeErr(401, { error: { message: 'invalid_api_key' } })
    );
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'es', fallback: 'FB' });
    const until1 = cooldown.getCooldownUntil('tier1');
    expect(until1).toBeGreaterThanOrEqual(t0 + cooldown.MAX_COOLDOWN_MS - 1000);
    expect(until1).toBeLessThanOrEqual(Date.now() + cooldown.MAX_COOLDOWN_MS + 1000);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    const callsAfterFirst = spy.mock.calls.length;
    await translateText('Hello again', { targetLang: 'es', fallback: 'FB' });
    // T1 skipped at entry (cooldown active); no additional HTTP call for T1
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('[BCS P3 T1] Tier 2 (DeepL) 403 => MAX cooldown', () => {
  it('403 sidelines T2 at MAX (DeepL uses 403 for auth; 456 remains quota via isT2QuotaExhausted)', async () => {
    config.translator = { deeplApiKey: 'd', googleEnabled: false };
    vi.spyOn(axios, 'post').mockRejectedValue(makeErr(403, { message: 'forbidden' }));
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'es', fallback: 'FB' });
    const until2 = cooldown.getCooldownUntil('tier2');
    expect(until2).toBeGreaterThanOrEqual(t0 + cooldown.MAX_COOLDOWN_MS - 1000);
    expect(until2).toBeLessThanOrEqual(Date.now() + cooldown.MAX_COOLDOWN_MS + 1000);
    expect(cooldown.isCoolingDown('tier2')).toBe(true);
  });
});

describe('[BCS P3 T1] Tier 3 (Google Cloud, AUTHENTICATED) 401/403 => MAX cooldown', () => {
  it('authed 401 sidelines T3 at MAX', async () => {
    config.translator = { googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockRejectedValue(makeErr(401, { error: 'unauthorized' }));
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'fr', fallback: 'FB' });
    const until3 = cooldown.getCooldownUntil('tier3');
    expect(until3).toBeGreaterThanOrEqual(t0 + cooldown.MAX_COOLDOWN_MS - 1000);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('authed 403 WITHOUT quotaExceeded body => auth path (MAX cooldown)', async () => {
    config.translator = { googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockRejectedValue(
      makeErr(403, { error: { message: 'permission denied' } })
    );
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'fr', fallback: 'FB' });
    const until3 = cooldown.getCooldownUntil('tier3');
    expect(until3).toBeGreaterThanOrEqual(t0 + cooldown.MAX_COOLDOWN_MS - 1000);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });

  it('authed 403 WITH quotaExceeded body => quota path takes precedence (still MAX; regression pin)', async () => {
    config.translator = { googleApiKey: 'g' };
    vi.spyOn(axios, 'post').mockRejectedValue(
      makeErr(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })
    );
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'fr', fallback: 'FB' });
    const until3 = cooldown.getCooldownUntil('tier3');
    expect(until3).toBeGreaterThanOrEqual(t0 + cooldown.MAX_COOLDOWN_MS - 1000);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });
});

describe('[BCS P3 T1] Tier 3 UNAUTHENTICATED gtx: SD-2 preserved (DEFAULT cooldown, not MAX)', () => {
  it('unauth gtx 401 keeps SD-2 semantics — auth-sideline does NOT fire without gKey', async () => {
    config.translator = {}; // no keys anywhere => T1/T2 skip, T3 hits unauth gtx (axios.get)
    vi.spyOn(axios, 'get').mockRejectedValue(makeErr(401, {}));
    const t0 = Date.now();
    await translateText('Hello', { targetLang: 'fr', fallback: 'FB' });
    const until3 = cooldown.getCooldownUntil('tier3');
    expect(until3).toBeGreaterThanOrEqual(t0 + cooldown.DEFAULT_COOLDOWN_MS - 1000);
    // Materially less than MAX (5 min). DEFAULT is 60s; leave a generous margin.
    expect(until3).toBeLessThan(t0 + cooldown.MAX_COOLDOWN_MS - 120_000);
    expect(cooldown.isCoolingDown('tier3')).toBe(true);
  });
});

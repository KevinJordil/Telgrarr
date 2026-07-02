import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const SUT_PATH    = require.resolve('../src/translator-cooldown.js');
const EVENTS_PATH = require.resolve('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');

function stub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

let emitted; let cd;
beforeEach(() => {
  delete require.cache[SUT_PATH];
  emitted = [];
  stub(EVENTS_PATH, { emit(type, level, module, message, data) { emitted.push({ type, level, module, message, data }); } });
  cd = require('../src/translator-cooldown.js');
});
function cooled() { return emitted.filter((e) => e.type === EVENT_TYPES.TRANSLATOR_TIER_COOLED); }

describe('TRANSLATOR_TIER_COOLED event (BLR Phase 4, DEC-BLR-19/20)', () => {
  it('noteRateLimit emits once with tier/rate/untilMs near now+DEFAULT', () => {
    const t0 = Date.now();
    cd.noteRateLimit(1);
    const c = cooled();
    expect(c.length).toBe(1);
    expect(c[0].type).toBe('translator.tier_cooled');
    expect(c[0].level).toBe('warn');
    expect(c[0].data.tier).toBe(1);
    expect(c[0].data.reason).toBe('rate');
    expect(c[0].data.untilMs).toBeGreaterThanOrEqual(t0 + cd.DEFAULT_COOLDOWN_MS);
    expect(c[0].data.untilMs).toBeLessThanOrEqual(Date.now() + cd.DEFAULT_COOLDOWN_MS);
    expect(cd.isCoolingDown(1)).toBe(true);
  });

  it('second noteRateLimit on the same tier in one cycle does not re-emit', () => {
    cd.noteRateLimit(1);
    cd.noteRateLimit(1, 120000);
    expect(cooled().length).toBe(1);
    expect(cd.isCoolingDown(1)).toBe(true);
  });

  it('noteQuotaExhausted emits reason quota with untilMs pinned near now+MAX', () => {
    const t0 = Date.now();
    cd.noteQuotaExhausted(2);
    const c = cooled();
    expect(c.length).toBe(1);
    expect(c[0].data).toMatchObject({ tier: 2, reason: 'quota' });
    expect(c[0].data.untilMs).toBeGreaterThanOrEqual(t0 + cd.MAX_COOLDOWN_MS);
    expect(c[0].data.untilMs).toBeLessThanOrEqual(Date.now() + cd.MAX_COOLDOWN_MS);
  });

  it('tiers are independent within a cycle', () => {
    cd.noteRateLimit(1);
    cd.noteQuotaExhausted(2);
    expect(cooled().length).toBe(2);
  });

  it('quota after rate on the SAME tier in one cycle stays at one emit (per-tier key)', () => {
    cd.noteRateLimit(3);
    cd.noteQuotaExhausted(3);
    expect(cooled().length).toBe(1);
  });

  it('clear() does not re-arm; resetCycle(id) does (DEC-BLR-20)', () => {
    cd.noteRateLimit(1);
    cd.clear();
    cd.noteRateLimit(1);
    expect(cooled().length).toBe(1);
    cd.resetCycle(2);
    cd.noteRateLimit(1);
    expect(cooled().length).toBe(2);
  });
});

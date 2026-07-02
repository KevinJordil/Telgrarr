import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const SUT_PATH    = require.resolve('../src/services/provider-breaker.js');
const EVENTS_PATH = require.resolve('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');

function stub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

let emitted; let breaker;
beforeEach(() => {
  delete require.cache[SUT_PATH];
  emitted = [];
  stub(EVENTS_PATH, { emit(type, level, module, message, data) { emitted.push({ type, level, module, message, data }); } });
  breaker = require('../src/services/provider-breaker.js');
});
function trips() { return emitted.filter((e) => e.type === EVENT_TYPES.PROVIDER_TRIPPED); }

describe('PROVIDER_TRIPPED event (BLR Phase 4, DEC-BLR-19/20)', () => {
  it('trip() emits once with reason auth and a secret-free payload', () => {
    breaker.trip('tmdb');
    const t = trips();
    expect(t.length).toBe(1);
    expect(t[0].type).toBe('provider.tripped');
    expect(t[0].level).toBe('warn');
    expect(t[0].data).toEqual({ provider: 'tmdb', reason: 'auth' });
    expect(breaker.isTripped('tmdb')).toBe(true);
    expect(breaker.getTrippedReason('tmdb')).toBe('auth');
  });

  it('same provider+reason twice in one cycle emits once; state unchanged', () => {
    breaker.trip('tmdb');
    breaker.trip('tmdb');
    expect(trips().length).toBe(1);
    expect(breaker.getTrippedReason('tmdb')).toBe('auth');
  });

  it('distinct reasons for the same provider each emit once per cycle', () => {
    breaker.trip('tmdb');
    breaker.tripRate('tmdb');
    const t = trips();
    expect(t.length).toBe(2);
    expect(t[1].data.reason).toBe('rate');
    expect(breaker.getTrippedReason('tmdb')).toBe('rate');
  });

  it('tripRate/tripQuota carry the correct reasons', () => {
    breaker.tripRate('tmdb');
    breaker.tripQuota('omdb');
    const t = trips();
    expect(t.length).toBe(2);
    expect(t[0].data).toEqual({ provider: 'tmdb', reason: 'rate' });
    expect(t[1].data).toEqual({ provider: 'omdb', reason: 'quota' });
  });

  it('reset() clears trip state but does NOT re-arm notification (DEC-BLR-20)', () => {
    breaker.trip('tmdb');
    breaker.reset();
    expect(breaker.isTripped('tmdb')).toBe(false);
    breaker.trip('tmdb');
    expect(trips().length).toBe(1);
    expect(breaker.isTripped('tmdb')).toBe(true);
  });

  it('resetCycle(id) re-arms the notification', () => {
    breaker.trip('tmdb');
    breaker.reset();
    breaker.resetCycle(2);
    breaker.trip('tmdb');
    expect(trips().length).toBe(2);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const rl = require('../src/auth/rate-limit.js');

describe('Soft login backoff (C.4b / S5)', () => {
  const IP = '1.2.3.4', USER = 'admin';
  beforeEach(() => { rl.clear(IP, USER); rl.clear(IP, 'other'); rl.clear('9.9.9.9', USER); });

  it('first failure carries no delay', () => {
    expect(rl.recordFailure(IP, USER, 1000)).toBe(0);
  });

  it('delay grows progressively and caps at MAX_DELAY', () => {
    const t = 1000;
    expect(rl.recordFailure(IP, USER, t)).toBe(0);
    expect(rl.recordFailure(IP, USER, t)).toBe(rl.STEP_MS);
    expect(rl.recordFailure(IP, USER, t)).toBe(2 * rl.STEP_MS);
    for (let i = 0; i < 50; i++) rl.recordFailure(IP, USER, t);
    expect(rl.recordFailure(IP, USER, t)).toBe(rl.MAX_DELAY);
  });

  it('never hard-blocks: exposes no lock/deny API', () => {
    expect(rl.isLocked).toBeUndefined();
    expect(rl.retryAfterSeconds).toBeUndefined();
  });

  it('success (clear) resets the backoff', () => {
    const t = 2000;
    rl.recordFailure(IP, USER, t); rl.recordFailure(IP, USER, t);
    rl.clear(IP, USER);
    expect(rl.recordFailure(IP, USER, t)).toBe(0);
  });

  it('an idle key resets after RESET_MS', () => {
    const t = 3000;
    rl.recordFailure(IP, USER, t); rl.recordFailure(IP, USER, t);
    expect(rl.recordFailure(IP, USER, t + rl.RESET_MS + 1)).toBe(0);
  });

  it('keyed on (IP + username): one key cannot slow another', () => {
    const t = 4000;
    for (let i = 0; i < 5; i++) rl.recordFailure(IP, USER, t);
    expect(rl.recordFailure(IP, 'other', t)).toBe(0);
    expect(rl.recordFailure('9.9.9.9', USER, t)).toBe(0);
    rl.clear(IP, 'other'); rl.clear('9.9.9.9', USER);
  });

  it('memory is hard-bounded by MAX_KEYS (anti-OOM)', () => {
    const t = 5000;
    for (let i = 0; i < rl.MAX_KEYS + 500; i++) rl.recordFailure(`ip-${i}`, USER, t);
    expect(rl.size()).toBeLessThanOrEqual(rl.MAX_KEYS);
  });
});

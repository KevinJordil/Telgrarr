import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const st = require('../src/auth/stream-ticket.js');

describe('Stream ticket (C.6b / S2)', () => {
  it('issues a usable, single-use ticket (burned after first consume)', () => {
    const t = 1000;
    const tk = st.issue(t);
    expect(typeof tk).toBe('string');
    expect(tk.length).toBeGreaterThan(0);
    expect(st.consume(tk, t)).toBe(true);
    expect(st.consume(tk, t)).toBe(false);
  });

  it('rejects unknown / empty tickets', () => {
    expect(st.consume('nope', 1000)).toBe(false);
    expect(st.consume('', 1000)).toBe(false);
    expect(st.consume(undefined, 1000)).toBe(false);
  });

  it('accepts within TTL, rejects after expiry', () => {
    const t = 2000;
    expect(st.consume(st.issue(t), t + st.TTL_MS - 1)).toBe(true);
    expect(st.consume(st.issue(t), t + st.TTL_MS + 1)).toBe(false);
  });

  it('burning reduces the live count', () => {
    const t = 4000;
    const before = st.size();
    const tk = st.issue(t);
    expect(st.size()).toBe(before + 1);
    st.consume(tk, t);
    expect(st.size()).toBe(before);
  });

  it('each issue is distinct', () => {
    expect(st.issue(5000)).not.toBe(st.issue(5000));
  });
});

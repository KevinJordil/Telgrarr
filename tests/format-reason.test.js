import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { formatReason } = require('../src/utils/format-reason.js');

describe('formatReason (FA-10)', () => {
  it('renders an Error as its .message only, no name/toString prefix', () => {
    expect(formatReason(new Error('boom'))).toBe('boom');
  });

  it('renders a custom Error subclass as its .message only', () => {
    class CustomError extends Error {}
    expect(formatReason(new CustomError('custom boom'))).toBe('custom boom');
  });

  it('renders a plain object via util.inspect, not "[object Object]"', () => {
    const out = formatReason({ code: 'ECONNRESET', errno: -104 });
    expect(out).not.toBe('[object Object]');
    expect(out).toContain('ECONNRESET');
    expect(out).toContain('-104');
  });

  it('renders an array via util.inspect rather than Array#toString', () => {
    const reason = [1, 2, 3];
    const out = formatReason(reason);
    // Array#toString / bare String() coercion would give '1,2,3' (no brackets).
    expect(out).not.toBe(String(reason));
    expect(out).toContain('1');
    expect(out).toContain('3');
  });

  it('renders null identically to the old template-literal coercion', () => {
    expect(formatReason(null)).toBe(String(null));
  });

  it('renders undefined identically to the old template-literal coercion', () => {
    expect(formatReason(undefined)).toBe(String(undefined));
  });

  it('renders a string reason unchanged (parity)', () => {
    expect(formatReason('plain string reason')).toBe('plain string reason');
  });

  it('renders a number reason via String() (parity)', () => {
    expect(formatReason(42)).toBe('42');
  });

  it('renders a boolean reason via String() (parity)', () => {
    expect(formatReason(false)).toBe('false');
  });

  it('renders a Symbol reason without throwing (old template coercion TypeErrors on Symbol)', () => {
    const sym = Symbol('oops');
    expect(() => formatReason(sym)).not.toThrow();
    expect(formatReason(sym)).toBe('Symbol(oops)');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cooldown = require('../src/translator-cooldown.js');

describe('translator-cooldown module (BLR Phase 2 / DEC-BLR-5..8)', () => {
  beforeEach(() => {
    cooldown.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); cooldown.clear(); });

  it('isCoolingDown returns false for an unknown tier', () => {
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('noteRateLimit with retryAfterMs sets cooldown; expires cleanly', () => {
    cooldown.noteRateLimit('tier1', 10_000);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('noteRateLimit without retryAfterMs uses DEFAULT_COOLDOWN_MS (60_000)', () => {
    cooldown.noteRateLimit('tier1');
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    vi.advanceTimersByTime(cooldown.DEFAULT_COOLDOWN_MS);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('noteRateLimit floor: values below MIN_COOLDOWN_MS are clamped up', () => {
    cooldown.noteRateLimit('tier1', 100);
    vi.advanceTimersByTime(100);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    vi.advanceTimersByTime(cooldown.MIN_COOLDOWN_MS - 100);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('noteRateLimit ceiling: values above MAX_COOLDOWN_MS are clamped down', () => {
    cooldown.noteRateLimit('tier1', 10 * 60 * 1000);
    vi.advanceTimersByTime(cooldown.MAX_COOLDOWN_MS);
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
  });

  it('noteQuotaExhausted pins cooldown at MAX_COOLDOWN_MS (DEC-BLR-6)', () => {
    cooldown.noteQuotaExhausted('tier2');
    vi.advanceTimersByTime(cooldown.MAX_COOLDOWN_MS - 1);
    expect(cooldown.isCoolingDown('tier2')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);
  });

  it('tiers are independent', () => {
    cooldown.noteRateLimit('tier1', 60_000);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);
    expect(cooldown.isCoolingDown('tier3')).toBe(false);
  });

  it('clear() resets all tier state', () => {
    cooldown.noteRateLimit('tier1', 60_000);
    cooldown.noteQuotaExhausted('tier2');
    cooldown.clear();
    expect(cooldown.isCoolingDown('tier1')).toBe(false);
    expect(cooldown.isCoolingDown('tier2')).toBe(false);
  });

  it('noteRateLimit handles NaN and negative values (falls back to DEFAULT)', () => {
    cooldown.noteRateLimit('tier1', NaN);
    vi.advanceTimersByTime(cooldown.DEFAULT_COOLDOWN_MS - 1);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
    cooldown.clear();
    cooldown.noteRateLimit('tier1', -500);
    vi.advanceTimersByTime(cooldown.DEFAULT_COOLDOWN_MS - 1);
    expect(cooldown.isCoolingDown('tier1')).toBe(true);
  });
});

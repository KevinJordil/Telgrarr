import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const rtl = require('../src/templates/rtl.js');
const dl  = require('../src/templates/default-layouts.js');

describe('rtl direction primitives (QB-6 single source)', () => {
  it('exposes the exact bidi control characters', () => {
    expect(rtl.RLM).toBe('\u200F');
    expect(rtl.LRI).toBe('\u2066');
    expect(rtl.PDI).toBe('\u2069');
    expect(rtl.ZWSP).toBe('&#8203;');
  });
  it('isRtl only for rtl', () => {
    expect(rtl.isRtl('rtl')).toBe(true);
    expect(rtl.isRtl('ltr')).toBe(false);
    expect(rtl.isRtl(undefined)).toBe(false);
  });
  it('wrapIsolate brackets a run with LRI...PDI', () => {
    expect(rtl.wrapIsolate('2024')).toBe('\u2066' + '2024' + '\u2069');
    expect(rtl.wrapIsolate(null)).toBe('\u2066\u2069');
  });
  it('linePrefix is RLM for rtl, empty for ltr', () => {
    expect(rtl.linePrefix('rtl')).toBe('\u200F');
    expect(rtl.linePrefix('ltr')).toBe('');
  });
});

describe('primitives match the legacy templates (oracle tie)', () => {
  it('AR templates use RLM + isolates + ZWSP', () => {
    for (const t of [dl.DEFAULT_SONARR_TEMPLATE, dl.DEFAULT_RADARR_TEMPLATE]) {
      expect(t.includes(rtl.RLM)).toBe(true);
      expect(t.includes(rtl.LRI)).toBe(true);
      expect(t.includes(rtl.PDI)).toBe(true);
      expect(t.includes(rtl.ZWSP)).toBe(true);
    }
  });
  it('EN templates carry ZWSP but never the RLM prefix', () => {
    for (const t of [dl.DEFAULT_SONARR_EN, dl.DEFAULT_RADARR_EN]) {
      expect(t.includes(rtl.ZWSP)).toBe(true);
      expect(t.includes(rtl.RLM)).toBe(false);
    }
  });
});

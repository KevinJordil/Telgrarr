import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { aiWatermark, LANG } = require('../src/translator.js');

describe('aiWatermark (D4 single-source AI watermark)', () => {
  it('defaults to Arabic; ar is the default', () => {
    expect(typeof aiWatermark()).toBe('string');
    expect(aiWatermark()).toBe(aiWatermark('ar'));
  });
  it('carries the blockquote watermark structure', () => {
    expect(aiWatermark().startsWith('\n\n<blockquote>')).toBe(true);
    expect(aiWatermark().endsWith('</blockquote>')).toBe(true);
  });
});

describe('aiWatermark per-language (P3.1)', () => {
  it('ar watermark unchanged (parity)', () => {
    const wm = aiWatermark('ar');
    expect(wm).toBe('\n\n<blockquote>' + LANG.ar.watermark + '</blockquote>');
    expect(/[\u0600-\u06FF]/.test(wm)).toBe(true);
  });

  it('each language returns its own watermark text', () => {
    for (const [key, lang] of Object.entries(LANG)) {
      const wm = aiWatermark(key);
      expect(wm).toBe('\n\n<blockquote>' + lang.watermark + '</blockquote>');
    }
  });

  it('unknown lang falls back to ar', () => {
    expect(aiWatermark('zz')).toBe(aiWatermark('ar'));
  });

  it('default param = ar (preserved)', () => {
    expect(aiWatermark()).toBe(aiWatermark('ar'));
  });
});

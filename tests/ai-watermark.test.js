import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { aiWatermark } = require('../src/translator.js');

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

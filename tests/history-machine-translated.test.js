import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { splitMachineTranslation } = require('../src/sweeper.js');
const { aiWatermark } = require('../src/translator.js');

describe('splitMachineTranslation (HIST-UPG P5)', () => {
  it('passes plain text through unchanged, flag false', () => {
    const r = splitMachineTranslation('A quiet detective story.');
    expect(r).toEqual({ text: 'A quiet detective story.', machineTranslated: false });
  });
  it('strips a trailing watermark and sets the flag (no retyped strings — derived from aiWatermark)', () => {
    const r = splitMachineTranslation('Plot text here.' + aiWatermark('ar'));
    expect(r.machineTranslated).toBe(true);
    expect(r.text).toBe('Plot text here.');
    expect(r.text.includes('<blockquote>')).toBe(false);
  });
  it('works for every supported watermark language', () => {
    for (const lang of ['ar', 'en', 'es', 'fr', 'de', 'pt']) {
      expect(splitMachineTranslation('X.' + aiWatermark(lang)))
        .toEqual({ text: 'X.', machineTranslated: true });
    }
  });
  it('returns null text for a watermark-only string', () => {
    expect(splitMachineTranslation(aiWatermark('ar').trim()))
      .toEqual({ text: null, machineTranslated: true });
  });
  it('handles null/undefined/empty without throwing', () => {
    expect(splitMachineTranslation(null)).toEqual({ text: null, machineTranslated: false });
    expect(splitMachineTranslation(undefined)).toEqual({ text: null, machineTranslated: false });
    expect(splitMachineTranslation('')).toEqual({ text: null, machineTranslated: false });
  });
  it('does not strip a non-trailing blockquote', () => {
    const src = 'Before <blockquote>quoted</blockquote> after.';
    expect(splitMachineTranslation(src)).toEqual({ text: src, machineTranslated: false });
  });
});

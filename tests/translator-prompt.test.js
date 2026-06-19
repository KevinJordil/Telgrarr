import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { STANDARD_PLOT_PROMPT, SHORT_PLOT_PROMPT, buildPrompt } = require('../src/translator-prompts.js');

describe('translator prompts (P2.3)', () => {
  it('standard prompt is the templated single source (em-dash preserved, {lang} token)', () => {
    expect(STANDARD_PLOT_PROMPT).toContain('{lang}');
    expect(STANDARD_PLOT_PROMPT).toContain('\u2014');
    expect(STANDARD_PLOT_PROMPT).toContain('cinematic translator');
    expect(STANDARD_PLOT_PROMPT).toContain('spoiler-free');
    expect(STANDARD_PLOT_PROMPT.includes('$' + '{')).toBe(false);
  });
  it('buildPrompt substitutes every {lang} for the standard variant', () => {
    const out = buildPrompt('Arabic', false);
    expect(out).toContain('professional Arabic');
    expect(out.includes('{lang}')).toBe(false);
    expect(out).toBe(STANDARD_PLOT_PROMPT.replaceAll('{lang}', 'Arabic'));
  });
  it('shortPlot=true selects the distinct ultra-short spoiler-free variant', () => {
    const std = buildPrompt('French', false);
    const short = buildPrompt('French', true);
    expect(short).not.toBe(std);
    expect(short).toContain('professional French');
    expect(short).toContain('spoiler-free');
    expect(short.includes('{lang}')).toBe(false);
    expect(SHORT_PLOT_PROMPT).toContain('{lang}');
  });
  it('default (no flag) equals the standard variant', () => {
    expect(buildPrompt('German')).toBe(buildPrompt('German', false));
  });
});

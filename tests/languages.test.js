import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { LANGUAGES, LANGUAGE_NAME } = require('../src/languages.js');
const { SETTINGS_SCHEMA } = require('../src/settings-schema.js');

const CODES = ['ar', 'en', 'es', 'fr', 'de', 'pt'];
function findField(key) {
  for (const section of SETTINGS_SCHEMA)
    for (const f of (section.fields || [])) if (f.key === key) return f;
  return null;
}
describe('languages leaf (DEC-9 single source)', () => {
  it('exposes exactly the 6 mission languages in order', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(CODES);
  });
  it('maps every code to its display name', () => {
    for (const l of LANGUAGES) expect(LANGUAGE_NAME[l.code]).toBe(l.name);
  });
  it('preserves ar identity (parity)', () => {
    expect(LANGUAGE_NAME.ar).toBe('Arabic');
  });
});
describe('settings-schema targetLang consumes the leaf (R02/QB-4)', () => {
  it('offers exactly the 6 languages, ar first, shape intact', () => {
    const f = findField('translator.targetLang');
    expect(f).toBeTruthy();
    expect(f.type).toBe('select');
    expect(f.options).toEqual(LANGUAGES.map((l) => ({ value: l.code, label: l.name })));
    expect(f.options[0]).toEqual({ value: 'ar', label: 'Arabic' });
  });
});

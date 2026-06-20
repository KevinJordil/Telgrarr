import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { resolveComposed, composeTemplate, DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');

describe('resolveComposed (DEC-11 default-mode bridge)', () => {
  it('DEFAULT_EN -> en + composed en template', () => {
    const r = resolveComposed('sonarr', 'DEFAULT_EN', 'ar');
    expect(r.lang).toBe('en');
    expect(r.template).toBe(composeTemplate('sonarr', 'en', DEFAULT_ORDER.sonarr));
  });
  it('DEFAULT_AR -> targetLang + composed target template', () => {
    const r = resolveComposed('radarr', 'DEFAULT_AR', 'es');
    expect(r.lang).toBe('es');
    expect(r.template).toBe(composeTemplate('radarr', 'es', DEFAULT_ORDER.radarr));
  });
  it('empty resolved defaults to ar', () => {
    const r = resolveComposed('sonarr', '', undefined);
    expect(r.lang).toBe('ar');
    expect(r.template).toBe(composeTemplate('sonarr', 'ar', DEFAULT_ORDER.sonarr));
  });
  it('custom slot string passes through with no lang', () => {
    const slot = '{{title}} custom slot body';
    const r = resolveComposed('sonarr', slot, 'ar');
    expect(r.template).toBe(slot);
    expect(r.lang).toBeNull();
  });
  it('fails fast on a non-registry targetLang (schema-prevented in prod)', () => {
    expect(() => resolveComposed('sonarr', 'DEFAULT_AR', 'zz')).toThrow();
  });
});

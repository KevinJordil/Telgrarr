import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { resolveComposed, composeTemplate, DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');

describe('P4.3b: resolveComposed honors a stored layout (order param)', () => {
  it('no order param == DEFAULT_ORDER path, byte-identical (ar/en, both kinds)', () => {
    for (const [resolved, lang] of [['DEFAULT_AR','ar'],['DEFAULT_EN','en']]) {
      for (const kind of ['sonarr','radarr']) {
        expect(resolveComposed(kind, resolved, 'ar').template).toBe(composeTemplate(kind, lang, DEFAULT_ORDER[kind]));
      }
    }
  });
  it('explicit default-order param == no param', () => {
    expect(resolveComposed('sonarr','DEFAULT_AR','ar', DEFAULT_ORDER.sonarr).template)
      .toBe(resolveComposed('sonarr','DEFAULT_AR','ar').template);
  });
  it('reordered layout changes the composed template', () => {
    const rev = DEFAULT_ORDER.sonarr.slice().reverse();
    const r = resolveComposed('sonarr','DEFAULT_AR','ar', rev);
    expect(r.template).toBe(composeTemplate('sonarr','ar', rev));
    expect(r.template).not.toBe(composeTemplate('sonarr','ar', DEFAULT_ORDER.sonarr));
  });
  it('enabled:false items are filtered before compose', () => {
    const key = DEFAULT_ORDER.sonarr[0];
    const withDisabled = [{ key, enabled:false }, ...DEFAULT_ORDER.sonarr.slice(1)];
    expect(resolveComposed('sonarr','DEFAULT_AR','ar', withDisabled).template)
      .toBe(composeTemplate('sonarr','ar', DEFAULT_ORDER.sonarr.slice(1)));
  });
  it('custom slot passes through untouched, no order applied', () => {
    const r = resolveComposed('sonarr','{{title}} slot','ar', DEFAULT_ORDER.sonarr);
    expect(r.template).toBe('{{title}} slot');
    expect(r.lang).toBeNull();
  });
});

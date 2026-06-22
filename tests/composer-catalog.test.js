import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { buildCatalog } = require('../src/templates/composer-catalog.js');
const S = require('../src/templates/layout-schema.js');
const { DEFAULT_ORDER, REGISTRY } = require('../src/templates/layout-fragments.js');
const { LANGUAGES } = require('../src/languages.js');

describe('P5c-1: composer catalog view-model', () => {
  const cat = buildCatalog();

  it('exposes labelMax, iconNone and the language set DRY from source', () => {
    expect(cat.labelMax).toBe(S.LABEL_MAX);
    expect(cat.iconNone).toBe(S.ICON_NONE);
    expect(cat.languages.map((l) => l.code)).toEqual(LANGUAGES.map((l) => l.code));
  });

  for (const kind of ['sonarr', 'radarr']) {
    it(`${kind}: orderable keys == layout-fragments DEFAULT_ORDER (single source)`, () => {
      expect(cat[kind].orderable.map((o) => o.key)).toEqual(DEFAULT_ORDER[kind]);
    });
    it(`${kind}: iconChoices mirror layout-schema ICON_CHOICES (empty for toggle-only)`, () => {
      for (const o of cat[kind].orderable) {
        expect(o.iconChoices).toEqual(o.toggleOnly ? [] : (S.ICON_CHOICES[o.key] || []));
      }
    });
    it(`${kind}: toggleOnly is true exactly for param-less (non-fragment) elements`, () => {
      for (const o of cat[kind].orderable) {
        expect(o.toggleOnly).toBe(!REGISTRY[kind].ar.paramsByKey[o.key]);
      }
    });
    it(`${kind}: prefix == in-kind catalog elements not in the orderable set`, () => {
      const orderKeys = DEFAULT_ORDER[kind];
      const expected = S.ELEMENT_CATALOG
        .filter((e) => e.kinds.includes(kind) && !orderKeys.includes(e.key))
        .map((e) => e.key);
      expect(cat[kind].prefix.map((p) => p.key)).toEqual(expected);
    });
    it(`${kind}: every element has a friendly name (no raw-key fallback)`, () => {
      for (const e of [...cat[kind].orderable, ...cat[kind].prefix]) {
        expect(typeof e.name).toBe('string');
        expect(e.name.length).toBeGreaterThan(0);
        expect(e.name).not.toBe(e.key);
      }
    });
    it(`${kind}: orderable labels mirror REGISTRY hasLabel/defaultLabel per language`, () => {
      for (const o of cat[kind].orderable) {
        expect(Object.keys(o.labels)).toEqual(LANGUAGES.map((l) => l.code));
        for (const l of LANGUAGES) {
          const p = REGISTRY[kind][l.code].paramsByKey[o.key];
          const editable = !!(p && p.hasLabel);
          expect(o.labels[l.code].editable).toBe(editable);
          expect(o.labels[l.code].default).toBe(editable ? p.defaultLabel : '');
        }
      }
    });
  }
});

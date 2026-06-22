import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { composeTemplate, resolveComposed, DEFAULT_ORDER, REGISTRY } = require('../src/templates/layout-fragments');
const L = require('../src/templates/default-layouts');

function stripStatus(s) {
  const i = s.indexOf('{{#if status');
  const j = s.indexOf('{{/if}}', i);
  return s.slice(0, i) + s.slice(j + 7);
}

describe('B3a status toggle (sonarr, inline in year)', () => {
  it('inserts status after year in the sonarr default order; radarr has none', () => {
    expect(DEFAULT_ORDER.sonarr).toEqual(['year','status','genres','plot','season','episode','runtime','imdbLink','seerrLink']);
    expect(DEFAULT_ORDER.radarr).not.toContain('status');
  });

  it('default order is byte-identical to the oracle (status ON, carried inline)', () => {
    expect(composeTemplate('sonarr','ar',DEFAULT_ORDER.sonarr)).toBe(L.DEFAULT_SONARR_TEMPLATE);
    expect(composeTemplate('sonarr','en',DEFAULT_ORDER.sonarr)).toBe(L.DEFAULT_SONARR_EN);
    expect(composeTemplate('radarr','ar',DEFAULT_ORDER.radarr)).toBe(L.DEFAULT_RADARR_TEMPLATE);
    expect(composeTemplate('radarr','en',DEFAULT_ORDER.radarr)).toBe(L.DEFAULT_RADARR_EN);
  });

  it('LTR sonarr defaults recompose unchanged with status inserted', () => {
    for (const lang of ['es','fr','de','pt']) {
      const reg = REGISTRY.sonarr[lang];
      const expected = reg.prefix + reg.orderKeys.map((k) => reg.fragsByKey[k]).join('') + reg.suffix;
      expect(composeTemplate('sonarr',lang,DEFAULT_ORDER.sonarr)).toBe(expected);
    }
  });

  it('status OFF == oracle minus exactly the status sub-block', () => {
    const off = DEFAULT_ORDER.sonarr.map((k) => k === 'status' ? { key: 'status', enabled: false } : k);
    expect(composeTemplate('sonarr','ar',off)).toBe(stripStatus(L.DEFAULT_SONARR_TEMPLATE));
    expect(composeTemplate('sonarr','en',off)).toBe(stripStatus(L.DEFAULT_SONARR_EN));
  });

  it('status OFF preserves a custom year icon override', () => {
    const order = DEFAULT_ORDER.sonarr.map((k) => {
      if (k === 'status') return { key: 'status', enabled: false };
      if (k === 'year') return { key: 'year', icon: '\u{1F4C5}' };
      return k;
    });
    const out = composeTemplate('sonarr','ar',order);
    expect(out).toContain('\u{1F4C5}');
    expect(out).not.toContain('{{#if status');
    expect(out).toContain('{{year}}');
  });

  it('legacy layout without status renders ON = byte-identical (backward compat)', () => {
    expect(composeTemplate('sonarr','ar',['year','genres','plot','season','episode','runtime','imdbLink','seerrLink'])).toBe(L.DEFAULT_SONARR_TEMPLATE);
  });

  it('resolveComposed passes order through unfiltered; composeTemplate omits disabled normals', () => {
    const gOff = DEFAULT_ORDER.sonarr.map((k) => k === 'genres' ? { key: 'genres', enabled: false } : k);
    expect(resolveComposed('sonarr','DEFAULT_AR','ar',gOff).template).toBe(composeTemplate('sonarr','ar',gOff));
    expect(resolveComposed('sonarr','DEFAULT_AR','ar',gOff).template).not.toContain('{{genres}}');
  });
});

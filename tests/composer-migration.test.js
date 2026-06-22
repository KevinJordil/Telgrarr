import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const T = require('../src/templates.js');
const { DEFAULT_ORDER, composeTemplate } = require('../src/templates/layout-fragments.js');

describe('P4.3a: layout defaults + DEC-10 single-source order', () => {
  it('defaultLayout mirrors DEFAULT_ORDER (parity guarantee)', () => {
    expect(T.defaultLayout()).toEqual({ sonarr: DEFAULT_ORDER.sonarr, radarr: DEFAULT_ORDER.radarr });
  });
  it('default layout composes byte-identically to DEFAULT_ORDER (ar+en)', () => {
    for (const kind of ['sonarr','radarr']) for (const lang of ['ar','en']) {
      expect(composeTemplate(kind, lang, T.defaultLayout()[kind])).toBe(composeTemplate(kind, lang, DEFAULT_ORDER[kind]));
    }
  });
});

describe('P4.3a: backward-compat load + normalization (no data loss)', () => {
  it('legacy/absent/garbage layout -> default', () => {
    expect(T.normalizeLayout(undefined)).toEqual(T.defaultLayout());
    expect(T.normalizeLayout(null)).toEqual(T.defaultLayout());
    expect(T.normalizeLayout('garbage')).toEqual(T.defaultLayout());
  });
  it('valid custom subset preserved in order', () => {
    const custom = { sonarr: ['plot', 'genres'], radarr: [DEFAULT_ORDER.radarr[0]] };
    expect(T.normalizeLayout(custom)).toEqual(custom);
  });
  it('object items keep enabled:false/label/valid icon; bare {key} collapses', () => {
    const r = T.normalizeLayout({ sonarr: [{ key:'season', label:'My Season' }, { key:'runtime', enabled:false }, { key:'genres', enabled:true }], radarr: [] });
    expect(r.sonarr).toEqual([{ key:'season', label:'My Season' }, { key:'runtime', enabled:false }, 'genres']);
  });
  it('drops unknown keys, duplicates, invalid icons', () => {
    const a = DEFAULT_ORDER.sonarr[0], b = DEFAULT_ORDER.sonarr[1];
    const r = T.normalizeLayout({ sonarr: ['bogus', a, a, { key:b, icon:'NOPE' }] });
    expect(r.sonarr).toEqual([a, b]);
  });
  it('empty-after-sanitize falls back to default for that kind only', () => {
    const r = T.normalizeLayout({ sonarr: ['bogus','alsoBogus'], radarr: [DEFAULT_ORDER.radarr[0]] });
    expect(r.sonarr).toEqual(DEFAULT_ORDER.sonarr);
    expect(r.radarr).toEqual([DEFAULT_ORDER.radarr[0]]);
  });
  it('live store loaded a valid layout', () => {
    const L = T.getLayout();
    for (const kind of ['sonarr','radarr']) {
      expect(Array.isArray(L[kind])).toBe(true);
      for (const it of L[kind]) expect(DEFAULT_ORDER[kind].includes(typeof it === 'string' ? it : it.key)).toBe(true);
    }
  });
  it('getTemplates() shape unchanged (no API regression)', () => {
    expect(Object.keys(T.getTemplates()).sort()).toEqual(['activeMode','slots']);
  });
});

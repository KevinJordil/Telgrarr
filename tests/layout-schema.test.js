import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const S = require('../src/templates/layout-schema.js');

const EXPECTED_KEYS = [
  'header', 'title', 'year', 'status', 'genres', 'plot', 'season', 'episode',
  'runtime', 'ratings.imdb', 'ratings.tmdb', 'ratings.rottenTomatoes',
  'ratings.metacritic', 'imdbLink', 'seerrLink',
];

describe('layout-schema element catalog (DEC-1/10)', () => {
  it('defines exactly the mission element set', () => {
    expect(S.ELEMENT_CATALOG.map((e) => e.key).sort()).toEqual([...EXPECTED_KEYS].sort());
  });
  it('every element declares kinds + a value source', () => {
    for (const e of S.ELEMENT_CATALOG) {
      expect(Array.isArray(e.kinds) && e.kinds.length > 0).toBe(true);
      e.kinds.forEach((k) => expect(['sonarr', 'radarr']).toContain(k));
      expect(typeof e.source === 'string' && e.source.length > 0).toBe(true);
    }
  });
  it('default orders reference only kind-appropriate catalog keys', () => {
    for (const key of S.SONARR_DEFAULT_ORDER) {
      expect(S.CATALOG_BY_KEY[key]).toBeTruthy();
      expect(S.CATALOG_BY_KEY[key].kinds).toContain('sonarr');
    }
    for (const key of S.RADARR_DEFAULT_ORDER) {
      expect(S.CATALOG_BY_KEY[key]).toBeTruthy();
      expect(S.CATALOG_BY_KEY[key].kinds).toContain('radarr');
    }
  });
  it('every catalog element appears in at least one default order', () => {
    const inOrder = new Set([...S.SONARR_DEFAULT_ORDER, ...S.RADARR_DEFAULT_ORDER]);
    for (const e of S.ELEMENT_CATALOG) expect(inOrder.has(e.key)).toBe(true);
  });
});

describe('layout-schema icon rules (DEC-4)', () => {
  it('every element has a curated set containing "none"', () => {
    for (const e of S.ELEMENT_CATALOG) {
      const set = S.ICON_CHOICES[e.key];
      expect(Array.isArray(set)).toBe(true);
      expect(set.length).toBeGreaterThanOrEqual(2);
      expect(set).toContain(S.ICON_NONE);
    }
  });
  it('isSingleEmoji accepts one emoji, rejects text / multiple / empty', () => {
    expect(S.isSingleEmoji('\u{1F3AD}')).toBe(true);
    expect(S.isSingleEmoji('\u{1F3AD}\u{1F4FA}')).toBe(false);
    expect(S.isSingleEmoji('ab')).toBe(false);
    expect(S.isSingleEmoji('x')).toBe(false);
    expect(S.isSingleEmoji('')).toBe(false);
  });
  it('isValidIcon: none + curated choice + single custom emoji ok; text rejected', () => {
    expect(S.isValidIcon(S.ICON_NONE, 'title')).toBe(true);
    expect(S.isValidIcon(S.ICON_CHOICES.title[0], 'title')).toBe(true);
    expect(S.isValidIcon('\u{1F600}', 'title')).toBe(true);
    expect(S.isValidIcon('hello', 'title')).toBe(false);
  });
});

describe('layout-schema label rules (DEC-3)', () => {
  it('LABEL_MAX is 40', () => { expect(S.LABEL_MAX).toBe(40); });
  it('escapeLabel escapes & < >', () => {
    expect(S.escapeLabel('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
  it('normalizeLabel trims and caps at LABEL_MAX', () => {
    expect(S.normalizeLabel('  hi  ')).toBe('hi');
    expect(S.normalizeLabel('x'.repeat(50)).length).toBe(40);
  });
});

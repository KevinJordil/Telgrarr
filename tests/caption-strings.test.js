import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CAPTION_STRINGS, LEAF_LANGS } = require('../src/templates/caption-strings.js');
const F = require('../src/templates/layout-fragments.js');
const { translateStatus } = require('../src/genres.js');

const LANGS = ['en', 'es', 'fr', 'de', 'pt'];
const LABEL_KEYS = ['year', 'season', 'runtime', 'ratings.imdb', 'ratings.tmdb', 'ratings.rottenTomatoes', 'ratings.metacritic', 'imdbLink', 'seerrLink'];
const STATUS_KEYS = ['ended', 'continuing', 'upcoming'];
const EPISODE_KEYS = ['single', 'range', 'multi'];
const RUNTIME_KEYS = ['episodeUnit', 'episodeAvgOpen', 'episodeAvgUnit', 'episodeAvgClose', 'totalHour', 'totalMin', 'totalJoin'];

describe('caption-strings: structural completeness', () => {
  it('covers exactly en/es/fr/de/pt (ar intentionally absent)', () => {
    expect([...LEAF_LANGS].sort()).toEqual(['de', 'en', 'es', 'fr', 'pt']);
    expect(CAPTION_STRINGS.ar).toBeUndefined();
  });
  for (const lang of LANGS) {
    it(lang + ' has all required keys, non-empty', () => {
      const s = CAPTION_STRINGS[lang];
      expect(s.header.sonarr.length).toBeGreaterThan(0);
      expect(s.header.radarr.length).toBeGreaterThan(0);
      for (const k of LABEL_KEYS) { expect(typeof s.labels[k]).toBe('string'); expect(s.labels[k].length).toBeGreaterThan(0); }
      for (const k of STATUS_KEYS) { expect(typeof s.status[k]).toBe('string'); expect(s.status[k].length).toBeGreaterThan(0); }
      for (const k of EPISODE_KEYS) { expect(typeof s.episode[k]).toBe('string'); expect(s.episode[k].length).toBeGreaterThan(0); }
      for (const k of RUNTIME_KEYS) { expect(typeof s.runtime[k]).toBe('string'); }
    });
  }
});

describe('caption-strings: ratings labels are brand-invariant', () => {
  for (const k of ['ratings.imdb', 'ratings.tmdb', 'ratings.rottenTomatoes', 'ratings.metacritic']) {
    it(k + ' identical in every language', () => {
      expect(new Set(LANGS.map((l) => CAPTION_STRINGS[l].labels[k])).size).toBe(1);
    });
  }
});

describe('caption-strings: en byte-matches the live oracle sources', () => {
  it('en headers match the EN template prefixes', () => {
    expect(F.REGISTRY.sonarr.en.prefix).toContain(CAPTION_STRINGS.en.header.sonarr);
    expect(F.REGISTRY.radarr.en.prefix).toContain(CAPTION_STRINGS.en.header.radarr);
  });
  it('en element labels match the EN fragment default labels', () => {
    const son = F.REGISTRY.sonarr.en.paramsByKey;
    const rad = F.REGISTRY.radarr.en.paramsByKey;
    expect(son.year.defaultLabel).toBe(CAPTION_STRINGS.en.labels.year);
    expect(son.season.defaultLabel).toBe(CAPTION_STRINGS.en.labels.season);
    expect(son.runtime.defaultLabel).toBe(CAPTION_STRINGS.en.labels.runtime);
    expect(son.imdbLink.defaultLabel).toBe(CAPTION_STRINGS.en.labels.imdbLink);
    expect(son.seerrLink.defaultLabel).toBe(CAPTION_STRINGS.en.labels.seerrLink);
    expect(rad.runtime.defaultLabel).toBe(CAPTION_STRINGS.en.labels.runtime);
    expect(rad['ratings.imdb'].defaultLabel).toBe(CAPTION_STRINGS.en.labels['ratings.imdb']);
    expect(rad['ratings.tmdb'].defaultLabel).toBe(CAPTION_STRINGS.en.labels['ratings.tmdb']);
    expect(rad['ratings.rottenTomatoes'].defaultLabel).toBe(CAPTION_STRINGS.en.labels['ratings.rottenTomatoes']);
    expect(rad['ratings.metacritic'].defaultLabel).toBe(CAPTION_STRINGS.en.labels['ratings.metacritic']);
  });
  it('en status equals the title-cased raw status (matches _statusEn)', () => {
    for (const k of STATUS_KEYS) {
      expect(CAPTION_STRINGS.en.status[k]).toBe(k.charAt(0).toUpperCase() + k.slice(1));
    }
  });
});

describe('caption-strings: status enum grounded in genres.js', () => {
  it('every leaf status key is a real (mapped) status', () => {
    for (const k of STATUS_KEYS) expect(translateStatus(k)).not.toBe(k);
  });
  it('every language localizes every status key', () => {
    for (const lang of LANGS) for (const k of STATUS_KEYS) expect(CAPTION_STRINGS[lang].status[k]).toBeTruthy();
  });
});

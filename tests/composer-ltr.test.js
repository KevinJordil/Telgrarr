import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const F = require('../src/templates/layout-fragments.js');
const L = require('../src/templates/default-layouts.js');
const { CAPTION_STRINGS } = require('../src/templates/caption-strings.js');

const LTR = ['es', 'fr', 'de', 'pt'];

describe('composer-ltr: ar/en registries unchanged (oracle)', () => {
  it('ar/en default order byte-identical', () => {
    expect(F.composeTemplate('sonarr', 'ar', F.DEFAULT_ORDER.sonarr)).toBe(L.DEFAULT_SONARR_TEMPLATE);
    expect(F.composeTemplate('sonarr', 'en', F.DEFAULT_ORDER.sonarr)).toBe(L.DEFAULT_SONARR_EN);
    expect(F.composeTemplate('radarr', 'ar', F.DEFAULT_ORDER.radarr)).toBe(L.DEFAULT_RADARR_TEMPLATE);
    expect(F.composeTemplate('radarr', 'en', F.DEFAULT_ORDER.radarr)).toBe(L.DEFAULT_RADARR_EN);
  });
});

describe('composer-ltr: registries present', () => {
  for (const lang of LTR) {
    it(lang + ' sonarr+radarr exist', () => {
      expect(F.REGISTRY.sonarr[lang]).toBeTruthy();
      expect(F.REGISTRY.radarr[lang]).toBeTruthy();
    });
  }
});

describe('composer-ltr: no AR contamination', () => {
  for (const lang of LTR) {
    for (const kind of ['sonarr', 'radarr']) {
      it(kind + '/' + lang + ' has no U+200F (RLM)', () => {
        expect(F.composeTemplate(kind, lang, F.DEFAULT_ORDER[kind]).includes('\u200f')).toBe(false);
      });
    }
    it('sonarr/' + lang + ' has no U+2066 (LRI) either', () => {
      expect(F.composeTemplate('sonarr', lang, F.DEFAULT_ORDER.sonarr).includes('\u2066')).toBe(false);
    });
  }
});

describe('composer-ltr: target header/labels + base tokens (sonarr)', () => {
  for (const lang of LTR) {
    it(lang, () => {
      const out = F.composeTemplate('sonarr', lang, F.DEFAULT_ORDER.sonarr);
      const cs = CAPTION_STRINGS[lang];
      expect(out).toContain(cs.header.sonarr);
      expect(out).toContain('<b>' + cs.labels.year + '</b>');
      expect(out).toContain('<b>' + cs.labels.season + '</b>');
      expect(out).toContain('<b>' + cs.labels.runtime + '</b>');
      expect(out).toContain('>' + cs.labels.imdbLink + '</a>');
      expect(out).toContain('>' + cs.labels.seerrLink + '</a>');
      expect(out).toContain('{{genres}}');
      expect(out).toContain('{{runtime}}');
      expect(out).toContain('{{epLabel}}');
      expect(out).toContain('{{statusAr}}');
      expect(out).not.toContain('genresEn');
      expect(out).not.toContain('runtime_en');
      expect(out).not.toContain('epLabel_en');
      expect(out).not.toContain('status_en');
      expect(out).not.toContain('New Series Added');
      expect(out).not.toContain('<b>Year:</b>');
      expect(out).not.toContain('<b>Season:</b>');
      expect(out).not.toContain('<b>Runtime:</b>');
      expect(out).not.toContain('>IMDb Link</a>');
      expect(out).not.toContain('>Server Link</a>');
    });
  }
});

describe('composer-ltr: radarr ratings brand-identical to EN', () => {
  for (const lang of LTR) {
    for (const r of ['ratings.imdb', 'ratings.tmdb', 'ratings.rottenTomatoes', 'ratings.metacritic']) {
      it(lang + ' ' + r + ' === EN', () => {
        expect(F.REGISTRY.radarr[lang].fragsByKey[r]).toBe(F.REGISTRY.radarr.en.fragsByKey[r]);
      });
    }
  }
});

describe('composer-ltr: extracted default labels match the leaf', () => {
  for (const lang of LTR) {
    it(lang + ' sonarr labels', () => {
      const p = F.REGISTRY.sonarr[lang].paramsByKey;
      const cs = CAPTION_STRINGS[lang];
      expect(p.year.defaultLabel).toBe(cs.labels.year);
      expect(p.season.defaultLabel).toBe(cs.labels.season);
      expect(p.runtime.defaultLabel).toBe(cs.labels.runtime);
      expect(p.imdbLink.defaultLabel).toBe(cs.labels.imdbLink);
      expect(p.seerrLink.defaultLabel).toBe(cs.labels.seerrLink);
    });
  }
});

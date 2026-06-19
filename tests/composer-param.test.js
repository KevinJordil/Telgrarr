import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const F = require('../src/templates/layout-fragments.js');
const L = require('../src/templates/default-layouts.js');
const S = require('../src/templates/layout-schema.js');

const LEG = {
  sonarr: { ar: L.DEFAULT_SONARR_TEMPLATE, en: L.DEFAULT_SONARR_EN },
  radarr: { ar: L.DEFAULT_RADARR_TEMPLATE, en: L.DEFAULT_RADARR_EN },
};

describe('composer-param: default-order parity (oracle)', () => {
  for (const kind of ['sonarr', 'radarr']) {
    for (const lang of ['ar', 'en']) {
      it(kind + '/' + lang + ' default order === legacy', () => {
        expect(F.composeTemplate(kind, lang, F.DEFAULT_ORDER[kind])).toBe(LEG[kind][lang]);
      });
      it(kind + '/' + lang + ' string order === descriptor order (backward-compat)', () => {
        const a = F.composeTemplate(kind, lang, F.DEFAULT_ORDER[kind]);
        const b = F.composeTemplate(kind, lang, F.DEFAULT_ORDER[kind].map((k) => ({ key: k })));
        expect(b).toBe(a);
      });
    }
  }
});

describe('composer-param: icon override / none / defensive', () => {
  it('radarr/en year icon override (no-label class)', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey.year;
    const ic = S.ICON_CHOICES.year[2];
    const out = F.composeTemplate('radarr', 'en', [{ key: 'year', icon: ic }]);
    expect(out).toContain(p.beforeIcon + ic + ' ' + p.noLabelBody);
    expect(out).not.toContain(p.defaultIcon + ' ' + p.noLabelBody);
  });
  it("radarr/en year icon 'none' drops emoji + one space", () => {
    const p = F.REGISTRY.radarr.en.paramsByKey.year;
    const out = F.composeTemplate('radarr', 'en', [{ key: 'year', icon: 'none' }]);
    expect(out).toContain(p.beforeIcon + p.noLabelBody);
    expect(out).not.toContain(p.defaultIcon);
  });
  it('invalid icon falls back to default (defensive)', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey.year;
    const out = F.composeTemplate('radarr', 'en', [{ key: 'year', icon: 'NOTICON' }]);
    expect(out).toContain(p.defaultIcon + ' ' + p.noLabelBody);
  });
});

describe('composer-param: label override (escape / cap / empty)', () => {
  it('bold label HTML-escaped (sonarr/en year)', () => {
    const p = F.REGISTRY.sonarr.en.paramsByKey.year;
    const esc = S.escapeLabel(S.normalizeLabel('A & B <x>'));
    const out = F.composeTemplate('sonarr', 'en', [{ key: 'year', label: 'A & B <x>' }]);
    expect(out).toContain(p.beforeIcon + p.defaultIcon + ' ' + p.mid + esc + p.afterLabel);
    expect(out).not.toContain(p.mid + p.defaultLabel + p.afterLabel);
  });
  it('plain label override (radarr/en ratings.imdb)', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey['ratings.imdb'];
    const out = F.composeTemplate('radarr', 'en', [{ key: 'ratings.imdb', label: 'Rating' }]);
    expect(out).toContain(p.beforeIcon + p.defaultIcon + ' ' + p.mid + 'Rating' + p.afterLabel);
    expect(out).not.toContain(p.mid + p.defaultLabel + p.afterLabel);
  });
  it('label capped at LABEL_MAX', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey['ratings.imdb'];
    const out = F.composeTemplate('radarr', 'en', [{ key: 'ratings.imdb', label: 'x'.repeat(60) }]);
    expect(out).toContain(p.mid + 'x'.repeat(S.LABEL_MAX) + p.afterLabel);
    expect(out).not.toContain('x'.repeat(S.LABEL_MAX + 1));
  });
  it('empty label drops label + wrapper (sonarr/en season bold)', () => {
    const p = F.REGISTRY.sonarr.en.paramsByKey.season;
    const out = F.composeTemplate('sonarr', 'en', [{ key: 'season', label: '' }]);
    expect(out).toContain(p.beforeIcon + p.defaultIcon + ' ' + p.emptyBody);
    expect(out).not.toContain(p.defaultLabel);
  });
  it('empty label yields textless anchor (radarr/en imdbLink)', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey.imdbLink;
    const out = F.composeTemplate('radarr', 'en', [{ key: 'imdbLink', label: '' }]);
    expect(out).toContain(p.beforeIcon + p.defaultIcon + ' ' + p.emptyBody);
  });
});

describe('composer-param: episode dynamic label not editable', () => {
  it('label override ignored on episode; {{epLabel}} intact', () => {
    const def = F.composeTemplate('sonarr', 'ar', [{ key: 'episode' }]);
    const ovr = F.composeTemplate('sonarr', 'ar', [{ key: 'episode', label: 'X' }]);
    expect(ovr).toBe(def);
    expect(def).toContain('{{epLabel}}');
  });
  it('icon override still works on episode', () => {
    const p = F.REGISTRY.sonarr.ar.paramsByKey.episode;
    const ic = S.ICON_CHOICES.episode[1];
    const out = F.composeTemplate('sonarr', 'ar', [{ key: 'episode', icon: ic }]);
    expect(out).toContain(p.beforeIcon + ic + ' ' + p.noLabelBody);
    expect(out).toContain('{{epLabel}}');
  });
});

describe('composer-param: enabled toggle omits', () => {
  it('enabled:false removes the fragment', () => {
    const p = F.REGISTRY.radarr.en.paramsByKey.genres;
    const withG = F.composeTemplate('radarr', 'en', [{ key: 'genres' }]);
    const without = F.composeTemplate('radarr', 'en', [{ key: 'genres', enabled: false }]);
    expect(withG).toContain(p.noLabelBody);
    expect(without).not.toContain(p.noLabelBody);
  });
});

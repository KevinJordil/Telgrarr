import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const F = require('../src/templates/layout-fragments.js');
const L = require('../src/templates/default-layouts.js');

const LEGACY = {
  sonarr: { ar: L.DEFAULT_SONARR_TEMPLATE, en: L.DEFAULT_SONARR_EN },
  radarr: { ar: L.DEFAULT_RADARR_TEMPLATE, en: L.DEFAULT_RADARR_EN },
};

function marker(lang, key) {
  const M = {
    year: '{{year}}',
    genres: lang === 'en' ? '{{genresEn}}' : '{{genres}}',
    plot: '{{{overview}}}',
    season: '{{seasonRange}}',
    episode: lang === 'en' ? '{{epLabel_en}}' : '{{epLabel}}',
    runtime: lang === 'en' ? '{{runtime_en}}' : '{{runtime}}',
    'ratings.imdb': '{{ratings.imdb}}',
    'ratings.tmdb': '{{ratings.tmdb}}',
    'ratings.rottenTomatoes': '{{ratings.rottenTomatoes}}',
    'ratings.metacritic': '{{ratings.metacritic}}',
    imdbLink: '{{imdbUrl}}',
    seerrLink: '{{seerrUrl}}',
  };
  return M[key];
}

describe('composeTemplate default == legacy (byte-identical parity oracle)', () => {
  for (const kind of ['sonarr', 'radarr']) {
    for (const lang of ['ar', 'en']) {
      it(kind + '/' + lang + ' reproduces the legacy template exactly', () => {
        expect(F.composeTemplate(kind, lang, F.DEFAULT_ORDER[kind])).toBe(LEGACY[kind][lang]);
      });
    }
  }
});

describe('fragment boundaries are element-correct (unique markers)', () => {
  for (const kind of ['sonarr', 'radarr']) {
    for (const lang of ['ar', 'en']) {
      it(kind + '/' + lang + ' each marker lives only in its own fragment', () => {
        const reg = F.REGISTRY[kind][lang];
        for (const key of reg.orderKeys) {
          const m = marker(lang, key);
          expect(reg.fragsByKey[key].includes(m)).toBe(true);
          for (const other of reg.orderKeys) {
            if (other !== key) expect(reg.fragsByKey[other].includes(m)).toBe(false);
          }
          expect(reg.prefix.includes(m)).toBe(false);
          expect(reg.suffix.includes(m)).toBe(false);
        }
      });
    }
  }
});

describe('descriptor order drives output (reorder + toggle)', () => {
  it('reordering swaps element output position', () => {
    const order = F.DEFAULT_ORDER.radarr.slice();
    const i = order.indexOf('ratings.imdb');
    const j = order.indexOf('runtime');
    [order[i], order[j]] = [order[j], order[i]];
    const out = F.composeTemplate('radarr', 'ar', order);
    expect(out.indexOf('{{ratings.imdb}}')).toBeLessThan(out.indexOf('{{runtime}}'));
  });
  it('omitting a Radarr element removes its token', () => {
    const order = F.DEFAULT_ORDER.radarr.filter((k) => k !== 'ratings.metacritic');
    expect(F.composeTemplate('radarr', 'ar', order).includes('{{ratings.metacritic}}')).toBe(false);
  });
  it('omitting a Sonarr element removes its token', () => {
    const order = F.DEFAULT_ORDER.sonarr.filter((k) => k !== 'season');
    expect(F.composeTemplate('sonarr', 'ar', order).includes('{{seasonRange}}')).toBe(false);
  });
});

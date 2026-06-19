import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const E = require('../src/template-engine.js');
const F = require('../src/templates/layout-fragments.js');
const { MOCK_SONARR, MOCK_RADARR } = require('../src/mocks/media-mocks.js');

const s = MOCK_SONARR.series, eps = MOCK_SONARR.single;
const m = MOCK_RADARR.movie, tm = MOCK_RADARR.tmdb, r = MOCK_RADARR.ratings;
const son = (tpl, lang) => E.renderSonarr(tpl, s, eps, lang ? { lang } : undefined);
const rad = (tpl, lang) => E.renderRadarr(tpl, m, tm, r, lang ? { lang } : undefined).caption;

describe('descriptor render == sentinel render (P4.2c)', () => {
  it('sonarr ar', () => expect(son(F.composeTemplate('sonarr','ar',F.DEFAULT_ORDER.sonarr),'ar')).toBe(son('DEFAULT_AR')));
  it('sonarr en', () => expect(son(F.composeTemplate('sonarr','en',F.DEFAULT_ORDER.sonarr),'en')).toBe(son('DEFAULT_EN')));
  it('radarr ar', () => expect(rad(F.composeTemplate('radarr','ar',F.DEFAULT_ORDER.radarr),'ar')).toBe(rad('DEFAULT_AR')));
  it('radarr en', () => expect(rad(F.composeTemplate('radarr','en',F.DEFAULT_ORDER.radarr),'en')).toBe(rad('DEFAULT_EN')));
});

describe('opts.lang drives the overview source for composed templates', () => {
  const sOv = { ...s, _overviewEn: 'ENGLISH_PLOT_X', _overviewAr: 'ARABIC_PLOT_X' };
  it('lang=en selects the English overview', () => {
    const cap = E.renderSonarr(F.composeTemplate('sonarr','en',F.DEFAULT_ORDER.sonarr), sOv, eps, { lang: 'en' });
    expect(cap.includes('ENGLISH_PLOT_X')).toBe(true);
    expect(cap.includes('ARABIC_PLOT_X')).toBe(false);
  });
  it('lang=ar selects the target/Arabic overview', () => {
    const cap = E.renderSonarr(F.composeTemplate('sonarr','ar',F.DEFAULT_ORDER.sonarr), sOv, eps, { lang: 'ar' });
    expect(cap.includes('ARABIC_PLOT_X')).toBe(true);
    expect(cap.includes('ENGLISH_PLOT_X')).toBe(false);
  });
});

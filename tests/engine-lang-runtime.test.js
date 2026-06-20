import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('../src/template-engine.js');
const { CAPTION_STRINGS } = require('../src/templates/caption-strings.js');

const rangeEps = [
  { seasonNumber: 1, episodeNumber: 1, _runtimeMinutes: 30 },
  { seasonNumber: 1, episodeNumber: 2, _runtimeMinutes: 45 },
];
const singleEps = [{ seasonNumber: 1, episodeNumber: 5, _runtimeMinutes: 50 }];
const multiEps = [
  { seasonNumber: 1, episodeNumber: 1, _runtimeMinutes: 40 },
  { seasonNumber: 2, episodeNumber: 1, _runtimeMinutes: 40 },
];
const son = (tmpl, eps, lang) => T.renderSonarr(tmpl, { title: 'X', year: 2021 }, eps, lang ? { lang } : undefined);
const rad = (tmpl, rt, lang) => T.renderRadarr(tmpl, { title: 'M', year: 2020 }, { runtime: rt }, {}, lang ? { lang } : undefined).caption;

describe('engine-lang: episode runtime base token', () => {
  it('es range uses leaf atoms', () => {
    const rt = CAPTION_STRINGS.es.runtime;
    expect(son('{{runtime}}', rangeEps, 'es')).toBe('30-45 ' + rt.episodeUnit + rt.episodeAvgOpen + 38 + rt.episodeAvgUnit + rt.episodeAvgClose);
    expect(son('{{runtime}}', rangeEps, 'es')).toBe('30-45 min (prom 38m)');
  });
  it('de single uses leaf unit', () => {
    expect(son('{{runtime}}', singleEps, 'de')).toBe('50 ' + CAPTION_STRINGS.de.runtime.episodeUnit);
  });
  it('en base runtime keeps legacy ar value (additive, unchanged)', () => {
    expect(son('{{runtime}}', rangeEps, 'en')).toBe(son('{{runtime}}', rangeEps, 'ar'));
  });
});

describe('engine-lang: episode label/value base token', () => {
  it('es range label from leaf, latin value', () => {
    expect(son('{{epLabel}}~{{epValue}}', rangeEps, 'es')).toBe(CAPTION_STRINGS.es.episode.range + '~1-2');
  });
  it('fr single label from leaf', () => {
    expect(son('{{epLabel}}', singleEps, 'fr')).toBe(CAPTION_STRINGS.fr.episode.single);
  });
  it('pt multiseason label from leaf', () => {
    expect(son('{{epLabel}}~{{epValue}}', multiEps, 'pt')).toBe(CAPTION_STRINGS.pt.episode.multi + '~2');
  });
});

describe('engine-lang: radarr total runtime base token', () => {
  it('de h+m', () => { expect(rad('{{runtime}}', 150, 'de')).toBe('2h 30m'); });
  it('es h only', () => { expect(rad('{{runtime}}', 120, 'es')).toBe('2h'); });
  it('fr m only', () => { expect(rad('{{runtime}}', 45, 'fr')).toBe('45m'); });
  it('en keeps legacy ar value (additive)', () => { expect(rad('{{runtime}}', 150, 'en')).toBe(rad('{{runtime}}', 150, 'ar')); });
});

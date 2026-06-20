import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const E = require('../src/template-engine.js');
const { aiWatermark } = require('../src/translator.js');
function movie(){ return { title:'M', year:2020, _genresAr:'GA', _genresEn:'GE', genres:['Drama'], runtime:120, imdbId:'tt1', ratings:{}, _seerrUrl:null }; }
function tmdb(ovAr){ return { _overviewAr:ovAr, _overviewEn:'en', overview:'fb', runtime:120, vote_average:8 }; }

describe('renderWithBudget strips the render-lang watermark (P4.2e-4b)', () => {
  it('es: truncates a long overview but preserves the es watermark intact', () => {
    const wm = aiWatermark('es');
    const r = E.renderRadarr('DEFAULT_AR', movie(), tmdb('Z'.repeat(2000) + wm), {}, { lang: 'es' });
    expect(r.caption.length).toBeLessThanOrEqual(1024);
    expect(r.caption.includes(wm)).toBe(true);
  });
  it('ar: parity — truncates, ar watermark intact', () => {
    const wm = aiWatermark('ar');
    const r = E.renderRadarr('DEFAULT_AR', movie(), tmdb('Z'.repeat(2000) + wm), {}, { lang: 'ar' });
    expect(r.caption.length).toBeLessThanOrEqual(1024);
    expect(r.caption.includes(wm)).toBe(true);
  });
});

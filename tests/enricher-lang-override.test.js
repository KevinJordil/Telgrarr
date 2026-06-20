import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { enrichSonarrMedia, enrichRadarrMedia, localizeStatus } = require('../src/services/media-enricher.js');
const config = require('../src/config.js');

const series = () => ({ title:'T', status:'Ended', genres:[], year:2020 });
const movie  = () => ({ title:'M', genres:[], year:2020, runtime:100 });

describe('P4.4b: enricher language override (default == config.targetLang)', () => {
  it('sonarr: override flows to localized status (es/fr distinct)', async () => {
    const es = await enrichSonarrMedia(series(), null, null, 'default_ar', 'es');
    const fr = await enrichSonarrMedia(series(), null, null, 'default_ar', 'fr');
    expect(es._statusAr).toBe(localizeStatus('Ended', 'es'));
    expect(fr._statusAr).toBe(localizeStatus('Ended', 'fr'));
    expect(es._statusAr).not.toBe(fr._statusAr);
  });
  it('sonarr: no override == passing config.targetLang explicitly (inert default)', async () => {
    const tl = config.translator?.targetLang || 'ar';
    const a = await enrichSonarrMedia(series(), null, null, 'default_ar');
    const b = await enrichSonarrMedia(series(), null, null, 'default_ar', tl);
    expect(a._statusAr).toBe(b._statusAr);
  });
  it('radarr: accepts the 5th arg and resolves (wiring)', async () => {
    const r = await enrichRadarrMedia(movie(), null, null, 'default_ar', 'es');
    expect(r.movie).toBeTruthy();
  });
});

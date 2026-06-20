import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { enrichSonarrMedia, enrichRadarrMedia } = require('../src/services/media-enricher.js');

// Canonical 'default' (P5b) must fire the AR plot cascade byte-identically to the legacy
// 'default_ar' alias; a non-default mode must skip it. Arabic plot keeps it deterministic
// offline (isAlreadyArabic => no translate/cache). AR via \u (QB-6 — never retyped).
const AR_PLOT = '\u0639\u0631\u0628\u064a \u0646\u0635';

describe('P5b: canonical "default" == "default_ar" for the AR enrichment trigger', () => {
  it('sonarr: "default" fires the AR plot cascade like "default_ar"; non-default skips', async () => {
    const mk = () => ({ title: 'T', status: 'Ended', genres: [], year: 2020, overview: AR_PLOT });
    const def    = await enrichSonarrMedia(mk(), null, null, 'default');
    const legacy = await enrichSonarrMedia(mk(), null, null, 'default_ar');
    const off    = await enrichSonarrMedia(mk(), null, null, 'someSlotId');
    expect(def._overviewAr).toBe(legacy._overviewAr);
    expect(def._overviewAr).not.toBeNull();
    expect(off._overviewAr).toBeNull();
  });

  it('radarr: "default" fires the AR plot cascade like "default_ar"; non-default skips', async () => {
    const mk = () => ({ title: 'M', genres: [], year: 2020, runtime: 100, overview: AR_PLOT });
    const def    = await enrichRadarrMedia(mk(), null, null, 'default');
    const legacy = await enrichRadarrMedia(mk(), null, null, 'default_ar');
    const off    = await enrichRadarrMedia(mk(), null, null, 'someSlotId');
    expect(def.tmdbMovie._overviewAr).toBe(legacy.tmdbMovie._overviewAr);
    expect(def.tmdbMovie._overviewAr).toBeTruthy();
    expect(off.tmdbMovie ? (off.tmdbMovie._overviewAr ?? null) : null).toBeNull();
  });
});

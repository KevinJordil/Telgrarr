import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// BCS F-EXT1: isolate DATA_DIR/LOGS_DIR so config.js never reads the
// operator's live data/config.json -- confirmed via diagnostic that the live
// file's aiOnlyPlot:true was silently overriding this pure unit test's
// TMDb-wins-cascade assumption (JS default in config.js is false).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-sonarr-enrich-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ } });

const { enrichSonarrMedia } = require('../src/services/media-enricher.js');
const config = require('../src/config.js');

// default_en avoids the translator (no network); covers the cascade + the gate.
describe('Sonarr enrichment overview cascade (P4.3)', () => {

  it('TMDb-TV overview wins the cascade', async () => {
    const s = await enrichSonarrMedia(
      { title: 'S', tmdbId: 1, imdbId: 'tt1', overview: 'From Sonarr.' },
      { overview: 'From TMDb.' }, { Plot: 'From OMDb.' }, 'default_en');
    expect(s._overviewEn).toBe('From TMDb.');
    expect(s._overviewAr).toBeNull();
  });

  it('falls back to OMDb Plot when TMDb has no overview', async () => {
    const s = await enrichSonarrMedia(
      { title: 'S', tmdbId: 1, imdbId: 'tt1', overview: 'From Sonarr.' },
      null, { Plot: 'From OMDb.' }, 'default_en');
    expect(s._overviewEn).toBe('From OMDb.');
  });

  it('ignores OMDb N/A and falls back to Sonarr own overview', async () => {
    const s = await enrichSonarrMedia(
      { title: 'S', tmdbId: 1, imdbId: 'tt1', overview: 'From Sonarr.' },
      null, { Plot: 'N/A' }, 'default_en');
    expect(s._overviewEn).toBe('From Sonarr.');
  });

  it('no source -> overview null', async () => {
    const s = await enrichSonarrMedia({ title: 'S' }, null, null, 'default_en');
    expect(s._overviewEn).toBeNull();
    expect(s._overviewAr).toBeNull();
  });

  it('preserves genres/status output (parity)', async () => {
    const s = await enrichSonarrMedia(
      { title: 'S', genres: ['Drama', 'Crime'], status: 'ended' },
      null, null, 'default_en');
    expect(s._genresEn).toBe('Drama \u2022 Crime');
    expect(s._statusEn).toBe('Ended');
  });

  it('plotEnabled=false suppresses the overview', async () => {
    const s = await enrichSonarrMedia(
      { title: 'S', tmdbId: 1, imdbId: 'tt1', overview: 'From Sonarr.' },
      { overview: 'From TMDb.' }, null, 'default_en', undefined, false);
    expect(s._overviewEn).toBeNull();
  });
});

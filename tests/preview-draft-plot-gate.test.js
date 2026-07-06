import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-48 / F10: proves the REAL templates.js <-> preview.routes.js plot-gate
// wiring. preview-draft-layout.test.js stubs templates.js entirely (its
// isElementEnabled stub ignores all arguments), so it cannot see a draft-vs-
// persisted disagreement on the plot-enrichment gate. This file leaves
// templates.js REAL (sandboxed DATA_DIR) and stubs only its non-templates
// dependencies, capturing the plot-enabled boolean each enrichment call
// receives.

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-f10-plotgate-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

let capturedPlotArgs = { sonarr: undefined, radarr: undefined };

stub('../src/template-engine.js', {
  renderSonarr: () => 'SONARR_CAPTION',
  renderRadarr: () => ({ caption: 'RADARR_CAPTION' }),
});
stub('../src/telegram.js', { sendPhoto: async () => {} });
stub('../src/middlewares/auth.js', { requireAuth: (req, res, next) => next() });
stub('../src/mocks/media-mocks.js', {
  MOCK_SONARR: { series: {}, single: [], multi: [], multiseason: [] },
  MOCK_RADARR: { movie: {}, tmdb: null, ratings: {} },
});
stub('../src/services/media-enricher.js', {
  enrichSonarrMedia: async (series, tmdbSeries, omdbData, mode, langOverride, plotEnabled) => {
    capturedPlotArgs.sonarr = plotEnabled;
    return {};
  },
  enrichRadarrMedia: async (movie, tmdbMovie, omdbData, mode, langOverride, plotEnabled) => {
    capturedPlotArgs.radarr = plotEnabled;
    return { movie: {}, tmdbMovie: null, ratings: {} };
  },
});
// Minimal stub DEFAULT_ORDER: only 'plot' + 'year' are needed to exercise the
// gate; 'year' is the PINNED_AFTER anchor for sonarr's non-orderable 'status'
// companion (templates.js), which may be silently appended -- harmless here,
// no assertion touches it.
stub('../src/templates/layout-fragments.js', {
  DEFAULT_ORDER: { sonarr: ['plot', 'year'], radarr: ['plot', 'year'] },
  resolveComposed: () => ({ template: 'TPL' }),
});
// FA-48 / F10 fix-forward: languages.js is intentionally NOT stubbed here.
// A partial stub (LANGUAGE_NAME only, omitting LANGUAGES) collides with
// settings-schema.js's real require of the same resolved path (config.js's
// chain, pulled in transitively by the real templates.js) -- require.cache
// interception is per-resolved-path, not per-importer, so a stub swaps out
// the module for EVERY consumer, not just preview.routes.js. Since none of
// this file's cases pass a `lang` field, resolveLang() never consults
// LANGUAGE_NAME anyway; the real (zero-dep) module is safe to load as-is.
// config.js and templates.js/logger.js are REAL, sandboxed via DATA_DIR/LOGS_DIR
// above (TD-1 isolation discipline) -- not stubbed, so setLayout/getLayout are
// the genuine production code path.

const templates = require('../src/templates.js');
const { renderPreview } = require('../src/routes/preview.routes.js');

beforeEach(() => {
  capturedPlotArgs = { sonarr: undefined, radarr: undefined };
});
afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

describe('preview plot-enrichment gate reads the DRAFT layout, not only persisted (FA-48 / F10)', () => {
  it('sonarr: a draft disabling plot overrides a persisted plot-ON layout', async () => {
    await templates.setLayout({ sonarr: ['plot', 'year'], radarr: ['plot', 'year'] });
    const draft = { sonarr: [{ key: 'plot', enabled: false }, 'year'], radarr: ['plot', 'year'] };
    await renderPreview({ type: 'sonarr', scenario: 'single', layout: draft });
    expect(capturedPlotArgs.sonarr).toBe(false);
  });

  it('sonarr: a draft enabling plot overrides a persisted plot-OFF layout', async () => {
    await templates.setLayout({ sonarr: [{ key: 'plot', enabled: false }, 'year'], radarr: ['plot', 'year'] });
    const draft = { sonarr: ['plot', 'year'], radarr: ['plot', 'year'] };
    await renderPreview({ type: 'sonarr', scenario: 'single', layout: draft });
    expect(capturedPlotArgs.sonarr).toBe(true);
  });

  it('radarr: a draft disabling plot overrides a persisted plot-ON layout', async () => {
    await templates.setLayout({ sonarr: ['plot', 'year'], radarr: ['plot', 'year'] });
    const draft = { sonarr: ['plot', 'year'], radarr: [{ key: 'plot', enabled: false }, 'year'] };
    await renderPreview({ type: 'radarr', scenario: 'single', layout: draft });
    expect(capturedPlotArgs.radarr).toBe(false);
  });

  it('absent draft: falls back to the persisted layout (parity, no regression)', async () => {
    await templates.setLayout({ sonarr: [{ key: 'plot', enabled: false }, 'year'], radarr: ['plot', 'year'] });
    await renderPreview({ type: 'sonarr', scenario: 'single' });
    expect(capturedPlotArgs.sonarr).toBe(false);
  });

  it('advanced (raw template) mode ignores any draft and gates plot from the persisted layout only', async () => {
    await templates.setLayout({ sonarr: ['plot', 'year'], radarr: ['plot', 'year'] });
    const draft = { sonarr: [{ key: 'plot', enabled: false }, 'year'], radarr: ['plot', 'year'] };
    await renderPreview({ type: 'sonarr', scenario: 'single', template: '<b>{{title}}</b>', layout: draft });
    expect(capturedPlotArgs.sonarr).toBe(true);
  });
});

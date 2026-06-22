import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// B4 — renderPreview composes from a GUI draft layout when one is sent (normalized via the
// load-safe templates.normalizeLayout) and otherwise from the persisted getLayout() order,
// byte-identically to pre-B4. Deterministic: every dep is stubbed (no network/engine).
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

let composedWith;   // resolveComposed(kind, mode, lang, order) capture
let normalizeArg;   // templates.normalizeLayout(raw) capture (undefined => not called)

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
  enrichSonarrMedia: async () => ({}),
  enrichRadarrMedia: async () => ({ movie: {}, tmdbMovie: null, ratings: {} }),
});
stub('../src/templates.js', {
  getLayout: () => ({ sonarr: ['SONARR_SAVED'], radarr: ['RADARR_SAVED'] }),
  getActiveMode: () => 'default',
  isElementEnabled: () => true,
  normalizeLayout: (raw) => { normalizeArg = raw; return { sonarr: ['SONARR_NORM'], radarr: ['RADARR_NORM'] }; },
});
stub('../src/config.js', { translator: { targetLang: 'ar' } });
stub('../src/templates/layout-fragments.js', {
  resolveComposed: (kind, mode, lang, order) => { composedWith.push({ kind, mode, lang, order }); return { template: 'TPL' }; },
});
stub('../src/languages.js', {
  LANGUAGE_NAME: { ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' },
});

let renderPreview;
beforeEach(() => {
  composedWith = [];
  normalizeArg = undefined;
  delete require.cache[require.resolve('../src/routes/preview.routes.js')];
  renderPreview = require('../src/routes/preview.routes.js').renderPreview;
});

describe('preview renderPreview — draft layout (B4)', () => {
  it('absent layout: composes sonarr from persisted getLayout() order (byte-identical fallback)', async () => {
    await renderPreview({ type: 'sonarr', scenario: 'single' });
    expect(composedWith).toHaveLength(1);
    expect(composedWith[0].order).toEqual(['SONARR_SAVED']);
    expect(normalizeArg).toBeUndefined();
  });

  it('absent layout: composes radarr from persisted getLayout() order', async () => {
    await renderPreview({ type: 'radarr', scenario: 'single' });
    expect(composedWith).toHaveLength(1);
    expect(composedWith[0].order).toEqual(['RADARR_SAVED']);
    expect(normalizeArg).toBeUndefined();
  });

  it('draft present: normalizes it and composes sonarr from the normalized order', async () => {
    const draft = { sonarr: [{ key: 'year' }], radarr: ['year'] };
    await renderPreview({ type: 'sonarr', scenario: 'single', layout: draft });
    expect(normalizeArg).toBe(draft);
    expect(composedWith[0].order).toEqual(['SONARR_NORM']);
  });

  it('draft present: composes radarr from the normalized order', async () => {
    const draft = { sonarr: ['year'], radarr: [{ key: 'year' }] };
    await renderPreview({ type: 'radarr', scenario: 'single', layout: draft });
    expect(normalizeArg).toBe(draft);
    expect(composedWith[0].order).toEqual(['RADARR_NORM']);
  });

  it('advanced (raw template) bypasses composition and ignores any draft layout', async () => {
    await renderPreview({ type: 'sonarr', scenario: 'single', template: '<b>{{title}}</b>', layout: { sonarr: ['year'], radarr: ['year'] } });
    expect(composedWith).toHaveLength(0);
    expect(normalizeArg).toBeUndefined();
  });

  it('non-object layout (array) falls back to persisted getLayout() order', async () => {
    await renderPreview({ type: 'sonarr', scenario: 'single', layout: ['year'] });
    expect(composedWith[0].order).toEqual(['SONARR_SAVED']);
    expect(normalizeArg).toBeUndefined();
  });
});

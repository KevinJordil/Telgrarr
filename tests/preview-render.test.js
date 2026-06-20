import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const { renderPreview, resolveLang } = require('../src/routes/preview.routes.js');
const config = require('../src/config.js');
const CS = require('../src/templates/caption-strings.js');

describe('P4.4c: preview renders the composed descriptor at the selected language', () => {
  it('radarr Default styling uses the selected-language header (non-mixed structure)', async () => {
    const r = await renderPreview({ type: 'radarr', lang: 'es' });
    expect(r.caption.includes(CS.captionStrings('es').header.radarr)).toBe(true);
    expect(r.photoUrl).toMatch(/^https:\/\//);
  });
  it('sonarr Default styling renders a non-empty caption', async () => {
    const r = await renderPreview({ type: 'sonarr', scenario: 'single', lang: 'ar' });
    expect(typeof r.caption).toBe('string');
    expect(r.caption.length).toBeGreaterThan(0);
  });
  it('language flows: es differs from ar', async () => {
    const es = await renderPreview({ type: 'radarr', lang: 'es' });
    const ar = await renderPreview({ type: 'radarr', lang: 'ar' });
    expect(es.caption).not.toBe(ar.caption);
  });
  it('Advanced raw template renders as-is, not the composed descriptor', async () => {
    const r = await renderPreview({ type: 'radarr', template: 'PREVIEW {{title}}', lang: 'es' });
    expect(r.caption.includes('PREVIEW ')).toBe(true);
    expect(r.caption.includes(CS.captionStrings('es').header.radarr)).toBe(false);
  });
  it('invalid/absent lang falls back to config.targetLang', () => {
    const tl = config.translator?.targetLang || 'ar';
    expect(resolveLang('zz')).toBe(tl);
    expect(resolveLang(undefined)).toBe(tl);
    expect(resolveLang('es')).toBe('es');
  });
});

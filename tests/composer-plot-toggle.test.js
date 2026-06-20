import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const templates = require('../src/templates.js');
const { DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');
const { enrichSonarrMedia } = require('../src/services/media-enricher.js');
const series = () => ({ title:'T', status:'Ended', genres:[], year:2020, overview:'A test plot.' });
describe('P4.5: plot layout-element toggle (isElementEnabled + plotEnabled arg)', () => {
  it('isElementEnabled: string=>on, {enabled:false}=>off, {enabled:true}=>on, absent=>off', () => {
    const orig = templates.getLayout;
    try {
      templates.getLayout = () => ({ sonarr:['plot'], radarr:[{ key:'plot', enabled:false }] });
      expect(templates.isElementEnabled('sonarr','plot')).toBe(true);
      expect(templates.isElementEnabled('radarr','plot')).toBe(false);
      templates.getLayout = () => ({ sonarr:[{ key:'plot', enabled:true, label:'X' }], radarr:[] });
      expect(templates.isElementEnabled('sonarr','plot')).toBe(true);
      expect(templates.isElementEnabled('radarr','plot')).toBe(false);
    } finally { templates.getLayout = orig; }
  });
  it('default order enables plot (parity with retired includePlot=true default)', () => {
    const orig = templates.getLayout;
    try {
      templates.getLayout = () => ({ sonarr: DEFAULT_ORDER.sonarr.slice(), radarr: DEFAULT_ORDER.radarr.slice() });
      expect(templates.isElementEnabled('sonarr','plot')).toBe(true);
      expect(templates.isElementEnabled('radarr','plot')).toBe(true);
    } finally { templates.getLayout = orig; }
    expect(typeof templates.isElementEnabled('sonarr','plot')).toBe('boolean');
  });
  it('enricher honors plotEnabled: false => no overview; true => overview present', async () => {
    const on  = await enrichSonarrMedia(series(), null, null, 'default_en', undefined, true);
    expect(on._overviewEn).toBe('A test plot.');
    const off = await enrichSonarrMedia(series(), null, null, 'default_en', undefined, false);
    expect(off._overviewEn).toBeNull();
  });
});

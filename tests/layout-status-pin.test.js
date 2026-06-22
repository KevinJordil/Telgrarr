import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-pin-'));
stub('../src/config.js', { DATA_DIR: TMP });
stub('../src/logger.js', { info() {}, audit() {}, error() {} });
stub('write-file-atomic', (file, data, cb) => { cb && cb(null); });
const { DEFAULT_ORDER, composeTemplate } = require('../src/templates/layout-fragments.js');
const L = require('../src/templates/default-layouts.js');
let T;
beforeEach(() => {
  delete require.cache[require.resolve('../src/templates.js')];
  T = require('../src/templates.js');
});
describe('B3b: status pin after year + legacy migration (sonarr only)', () => {
  it('default sonarr layout has status immediately after year; normalize is idempotent', () => {
    const d = T.defaultLayout();
    expect(d.sonarr[d.sonarr.indexOf('year') + 1]).toBe('status');
    expect(T.normalizeLayout(d)).toEqual(d);
  });
  it('inserts status (enabled) after year for a legacy layout lacking it', () => {
    const legacy = ['year', 'genres', 'plot', 'season', 'episode', 'runtime', 'imdbLink', 'seerrLink'];
    const n = T.normalizeLayout({ sonarr: legacy, radarr: DEFAULT_ORDER.radarr.slice() });
    expect(n.sonarr[0]).toBe('year');
    expect(n.sonarr[1]).toBe('status');
    expect(n.sonarr.filter((k) => k === 'status').length).toBe(1);
  });
  it('re-pins status to immediately after year regardless of input position', () => {
    const n = T.normalizeLayout({ sonarr: ['year', 'genres', 'status', 'plot'], radarr: [] });
    expect(n.sonarr.indexOf('status')).toBe(1);
  });
  it('preserves a disabled status across the pin', () => {
    const n = T.normalizeLayout({ sonarr: [{ key: 'status', enabled: false }, 'year', 'genres'], radarr: [] });
    expect(n.sonarr[1]).toEqual({ key: 'status', enabled: false });
  });
  it('strips inert icon/label from status (status has neither in output)', () => {
    const n = T.normalizeLayout({ sonarr: ['year', { key: 'status', icon: '\u{1F4CA}', label: 'Stat' }], radarr: [] });
    expect(n.sonarr[1]).toBe('status');
  });
  it('omits status when year is absent (cannot render inline)', () => {
    const n = T.normalizeLayout({ sonarr: ['genres', 'plot'], radarr: [] });
    expect(n.sonarr.some((k) => (typeof k === 'string' ? k : k.key) === 'status')).toBe(false);
  });
  it('radarr is unaffected (no status pin)', () => {
    const n = T.normalizeLayout({ sonarr: DEFAULT_ORDER.sonarr.slice(), radarr: DEFAULT_ORDER.radarr.slice() });
    expect(n.radarr).not.toContain('status');
  });
  it('migrated legacy layout renders status ON, byte-identical to the oracle', () => {
    const legacy = ['year', 'genres', 'plot', 'season', 'episode', 'runtime', 'imdbLink', 'seerrLink'];
    const n = T.normalizeLayout({ sonarr: legacy, radarr: DEFAULT_ORDER.radarr.slice() });
    expect(composeTemplate('sonarr', 'ar', n.sonarr)).toBe(L.DEFAULT_SONARR_TEMPLATE);
  });
});

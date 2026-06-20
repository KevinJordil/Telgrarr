import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
const require = createRequire(import.meta.url);

function stub(rel, exports) {
  const resolved = require.resolve(rel);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
stub('../src/config.js', { DATA_DIR: path.join(os.tmpdir(), 'telgrarr-legacyplot-' + process.pid) });
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
let written = null;
stub('write-file-atomic', (file, data, cb) => { written = data; if (cb) cb(null); });

let T;
beforeEach(() => {
  written = null;
  delete require.cache[require.resolve('../src/templates.js')];
  T = require('../src/templates.js');
});

describe('P4.5b: legacy includePlot=false -> plot element disabled (one-shot, P5-safe)', () => {
  it('false disables plot for that kind; true/undefined leaves plot enabled', async () => {
    const changed = await T.migrateLegacyPlot({ sonarr: false, radarr: true });
    expect(changed).toBe(true);
    expect(T.isElementEnabled('sonarr', 'plot')).toBe(false);
    expect(T.isElementEnabled('radarr', 'plot')).toBe(true);
  });

  it('one-shot ledger: a second run no-ops before persist (cannot fight a later P5 re-enable)', async () => {
    await T.migrateLegacyPlot({ sonarr: false });
    expect(T.isElementEnabled('sonarr', 'plot')).toBe(false);
    written = null;
    const changed = await T.migrateLegacyPlot({ sonarr: false });
    expect(changed).toBe(false);
    expect(written).toBeNull();
  });

  it('no legacy false still marks the migration done (one persist); plot stays enabled', async () => {
    const changed = await T.migrateLegacyPlot({});
    expect(changed).toBe(false);
    expect(T.isElementEnabled('sonarr', 'plot')).toBe(true);
    expect(T.isElementEnabled('radarr', 'plot')).toBe(true);
    written = null;
    await T.migrateLegacyPlot({ sonarr: false });
    expect(written).toBeNull();
    expect(T.isElementEnabled('sonarr', 'plot')).toBe(true);
  });
});

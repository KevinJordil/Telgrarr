import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);

// dep-injection (carry-forward §3): stub config/logger/write-file-atomic BEFORE the SUT
// so persist() never hits real disk and loadFromDisk starts from clean defaults.
// layout-fragments + layout-schema stay REAL (normalizeLayout needs them).
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

let captured = null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-setlayout-'));

stub('../src/config.js', { DATA_DIR: TMP });
stub('../src/logger.js', { info() {}, audit() {}, error() {} });
stub('write-file-atomic', (file, data, cb) => { captured = data; cb && cb(null); });

const { DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');

let T;
beforeEach(() => {
  delete require.cache[require.resolve('../src/templates.js')];
  T = require('../src/templates.js');
  captured = null;
});

describe('P5(a): setLayout write path', () => {
  it('persists a reordered/toggled layout, auto-pinning status after year', async () => {
    const next = { sonarr: ['genres', { key: 'year', enabled: false }, 'plot'], radarr: DEFAULT_ORDER.radarr.slice() };
    const expected = ['genres', { key: 'year', enabled: false }, 'status', 'plot'];
    const ret = await T.setLayout(next);
    expect(ret).toEqual(T.getLayout());
    expect(T.getLayout().sonarr).toEqual(expected);
    expect(JSON.parse(captured).layout.sonarr).toEqual(expected);
  });

  it('routes contents through normalizeLayout (drops unknown/dupe keys)', async () => {
    const a = DEFAULT_ORDER.sonarr[0], b = DEFAULT_ORDER.sonarr[1];
    await T.setLayout({ sonarr: ['bogus', a, a, b], radarr: DEFAULT_ORDER.radarr.slice() });
    expect(T.getLayout().sonarr).toEqual([a, b]);
  });

  it('throws on malformed payloads (fail-fast, no persist)', async () => {
    await expect(T.setLayout(null)).rejects.toThrow();
    await expect(T.setLayout('garbage')).rejects.toThrow();
    await expect(T.setLayout([])).rejects.toThrow();
    await expect(T.setLayout({ sonarr: DEFAULT_ORDER.sonarr.slice() })).rejects.toThrow();
    await expect(T.setLayout({ sonarr: 'x', radarr: [] })).rejects.toThrow();
    expect(captured).toBe(null);
  });

  it('preserves slots, activeMode and the migrations ledger across the write', async () => {
    await T.addSlot({ id: 's1', name: 'Mine', sonarr: 'X' });
    await T.setActiveMode('s1');
    await T.migrateLegacyPlot({});
    captured = null;
    await T.setLayout({ sonarr: DEFAULT_ORDER.sonarr.slice(), radarr: DEFAULT_ORDER.radarr.slice() });
    const p = JSON.parse(captured);
    expect(p.migrations.legacyPlot).toBe(true);
    expect(p.activeMode).toBe('s1');
    expect(p.slots.map(s => s.id)).toEqual(['s1']);
  });
});

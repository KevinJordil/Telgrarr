import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import os from 'os';
import fs from 'fs';
import path from 'path';

// Dep-injection harness (roadmap S3): stub config(DATA_DIR -> fresh empty tmp dir so
// loadFromDisk finds no templates.json => clean DEFAULTS), logger, write-file-atomic
// (no real disk write). layout-fragments/layout-schema stay REAL (pure). Fresh singleton
// per test via cache deletion.
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-canon-'));
stub('../src/config.js', { DATA_DIR: TMP });
stub('../src/logger.js', { error() {}, audit() {}, info() {} });
stub('write-file-atomic', (file, data, cb) => { if (cb) cb(null); });

let T;
beforeEach(() => {
  delete require.cache[require.resolve('../src/templates.js')];
  T = require('../src/templates.js');
});

describe('P5b: canonical "default" activeMode', () => {
  it('resolveTemplate("default") == DEFAULT_AR for both kinds (== legacy default_ar)', () => {
    expect(T.resolveTemplate('default', 'sonarr')).toBe('DEFAULT_AR');
    expect(T.resolveTemplate('default', 'radarr')).toBe('DEFAULT_AR');
    expect(T.resolveTemplate('default', 'sonarr')).toBe(T.resolveTemplate('default_ar', 'sonarr'));
  });

  it('legacy aliases still resolve unchanged', () => {
    expect(T.resolveTemplate('default_ar', 'sonarr')).toBe('DEFAULT_AR');
    expect(T.resolveTemplate('default_en', 'radarr')).toBe('DEFAULT_EN');
  });

  it('fresh DEFAULTS.activeMode is the canonical "default"', () => {
    expect(T.getActiveMode()).toBe('default');
  });

  it('addSlot rejects each reserved id', async () => {
    await expect(T.addSlot({ id: 'default', name: 'X' })).rejects.toThrow(/reserved/i);
    await expect(T.addSlot({ id: 'default_ar', name: 'X' })).rejects.toThrow(/reserved/i);
    await expect(T.addSlot({ id: 'default_en', name: 'X' })).rejects.toThrow(/reserved/i);
  });

  it('deleteSlot on the active slot falls back to canonical "default"', async () => {
    await T.addSlot({ id: 's1', name: 'Mine', sonarr: 'X' });
    await T.setActiveMode('s1');
    expect(T.getActiveMode()).toBe('s1');
    await T.deleteSlot('s1');
    expect(T.getActiveMode()).toBe('default');
  });
});

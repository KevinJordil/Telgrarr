import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import os from 'os';
import fs from 'fs';
import path from 'path';

// FA-50 / F11.6b: no prior suite covers templates.updateSlot at all
// (template-resolver.test.js only exercises resolveTemplate/getSlotById via
// spy, confirmed by full read). DI harness matches the established pattern
// (canonical-default-mode.test.js / composer-set-layout.test.js): stub
// config/logger/write-file-atomic before the SUT so persist() never hits
// real disk and loadFromDisk starts from clean defaults.
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }

let captured = null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-updateslot-'));
stub('../src/config.js', { DATA_DIR: TMP });
stub('../src/logger.js', { error() {}, audit() {}, info() {} });
stub('write-file-atomic', (file, data, cb) => { captured = data; cb && cb(null); });

let T;
beforeEach(() => {
  delete require.cache[require.resolve('../src/templates.js')];
  T = require('../src/templates.js');
  captured = null;
});

describe('templates.updateSlot', () => {
  it('[parity] updates name only, sonarr/radarr preserved', async () => {
    await T.addSlot({ id: 's1', name: 'Original', sonarr: 'S', radarr: 'R' });
    captured = null;
    const result = await T.updateSlot('s1', { name: 'Renamed' });
    const slot = result.slots.find((s) => s.id === 's1');
    expect(slot).toEqual({ id: 's1', name: 'Renamed', sonarr: 'S', radarr: 'R' });
    expect(JSON.parse(captured).slots.find((s) => s.id === 's1')).toEqual(slot);
  });

  it('[parity] updates sonarr and radarr together, name untouched', async () => {
    await T.addSlot({ id: 's1', name: 'Original', sonarr: 'S', radarr: 'R' });
    const result = await T.updateSlot('s1', { sonarr: 'S2', radarr: 'R2' });
    const slot = result.slots.find((s) => s.id === 's1');
    expect(slot).toEqual({ id: 's1', name: 'Original', sonarr: 'S2', radarr: 'R2' });
  });

  it('[parity] throws Slot not found for an unknown id', async () => {
    await expect(T.updateSlot('ghost', { name: 'X' })).rejects.toThrow(/slot not found/i);
  });

  it('[parity] a patch cannot override the slot id', async () => {
    await T.addSlot({ id: 's1', name: 'Original', sonarr: 'S', radarr: 'R' });
    const result = await T.updateSlot('s1', { id: 'hacked', name: 'Renamed' });
    expect(result.slots.find((s) => s.id === 's1')).toBeTruthy();
    expect(result.slots.find((s) => s.id === 'hacked')).toBeUndefined();
  });

  it('FA-50-JUNK-KEY: drops an unknown field from the patch instead of persisting it', async () => {
    await T.addSlot({ id: 's1', name: 'Original', sonarr: 'S', radarr: 'R' });
    captured = null;
    const result = await T.updateSlot('s1', { name: 'Renamed', evil: 'payload' });
    const slot = result.slots.find((s) => s.id === 's1');
    expect(slot).toEqual({ id: 's1', name: 'Renamed', sonarr: 'S', radarr: 'R' });
    expect(Object.keys(slot).sort()).toEqual(['id', 'name', 'radarr', 'sonarr']);
    expect(JSON.parse(captured).slots.find((s) => s.id === 's1').evil).toBeUndefined();
  });

  it('FA-50-JUNK-ONLY: a patch containing ONLY unknown keys leaves the slot unchanged', async () => {
    await T.addSlot({ id: 's1', name: 'Original', sonarr: 'S', radarr: 'R' });
    const before = T.getSlots().find((s) => s.id === 's1');
    const result = await T.updateSlot('s1', { junkOnly: true });
    const slot = result.slots.find((s) => s.id === 's1');
    expect(slot).toEqual(before);
  });
});

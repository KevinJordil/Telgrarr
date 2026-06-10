import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

// O6 / R13 guard: pruneBackups honors config.backup.retainCount exactly — including an
// explicit 0 (the old `|| 5` masked it). fs is monkeypatched so the test simulates the
// backups dir without touching real files (BACKUP_DIR is supplied by the stubbed config).

const cfg = { DATA_DIR: '/tmp/telgrarr-backup-test', BACKUP_DIR: '/tmp/telgrarr-backup-test/backups', backup: { retainCount: 5 } };

function stub(spec, exports) {
  const r = require.resolve(spec);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
stub('../src/config.js', cfg);
stub('../src/logger.js', { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });

const backup = require('../src/backup.js');

let zips = [];
let unlinked = [];
const orig = { existsSync: fs.existsSync, readdirSync: fs.readdirSync, statSync: fs.statSync, unlinkSync: fs.unlinkSync };

beforeEach(() => {
  unlinked = [];
  zips = ['b1.zip', 'b2.zip', 'b3.zip', 'b4.zip', 'b5.zip'];
  fs.existsSync = () => true;
  fs.readdirSync = () => zips.slice();
  fs.statSync = (p) => {
    const name = String(p).split('/').pop();
    const idx = zips.indexOf(name); // b1 oldest ... b5 newest
    return { size: 1, birthtime: new Date(2020, 0, idx + 1) };
  };
  fs.unlinkSync = (p) => { unlinked.push(String(p).split('/').pop()); };
});

afterAll(() => { Object.assign(fs, orig); });

describe('backup.pruneBackups (O6/R13 — honors config.backup.retainCount)', () => {
  it('retainCount=0 prunes ALL backups (was masked to 5 by || 5)', () => {
    cfg.backup.retainCount = 0;
    backup.pruneBackups();
    expect(unlinked).toHaveLength(5);
  });

  it('retainCount=2 keeps the 2 newest, prunes the other 3', () => {
    cfg.backup.retainCount = 2;
    backup.pruneBackups();
    expect(unlinked).toHaveLength(3);
    expect(unlinked.sort()).toEqual(['b1.zip', 'b2.zip', 'b3.zip']);
  });

  it('retainCount >= count prunes nothing', () => {
    cfg.backup.retainCount = 10;
    backup.pruneBackups();
    expect(unlinked).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// FA-23 / FA-24(ii) (Master §7 D-E): backup.js wrote three secret-bearing
// artifacts (restore-staged files, created archives, imported archives) at
// default fs mode, relying on nothing to secure them. This suite proves each
// site now lands at 0600. Real-fs harness mirrors backup-restore.test.js
// (env vars set BEFORE requiring config/backup; tmp DATA/BACKUP dirs).
const tmp = path.join(os.tmpdir(), `telgrarr-backupperms-${process.pid}-${Date.now()}`);
const DATA = path.join(tmp, 'data');
const BK   = path.join(tmp, 'backups');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BK,   { recursive: true });
process.env.DATA_DIR   = DATA;
process.env.BACKUP_DIR = BK;
process.env.LOGS_DIR   = path.join(tmp, 'logs');

require('../src/config.js');
const backup = require('../src/backup.js');
const AdmZip = require('adm-zip');

const mode = (f) => fs.statSync(f).mode & 0o777;

function makeZip(name, files) {
  const zip = new AdmZip();
  for (const [n, c] of Object.entries(files)) zip.addFile(n, Buffer.from(c));
  zip.writeZip(path.join(BK, name));
}

beforeEach(() => {
  for (const f of fs.readdirSync(DATA)) fs.rmSync(path.join(DATA, f), { force: true });
  for (const f of fs.readdirSync(BK))   fs.rmSync(path.join(BK, f),   { recursive: true, force: true });
});
afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

describe('FA-23/FA-24(ii) backup.js secret-bearing writes are 0600', () => {
  it('restoreBackup lands the live file at 0600 (staged-write mode, FA-23)', () => {
    makeZip('perm-restore.zip', { 'auth.json': '{"a":1}', 'config.json': '{"b":2}' });
    const r = backup.restoreBackup('perm-restore.zip');
    expect(r.success).toBe(true);
    expect(mode(path.join(DATA, 'auth.json'))).toBe(0o600);
    expect(mode(path.join(DATA, 'config.json'))).toBe(0o600);
  });

  it('createBackup writes the archive at 0600 (FA-24ii)', () => {
    fs.writeFileSync(path.join(DATA, 'config.json'), '{"x":1}');
    const r = backup.createBackup();
    expect(r.success).toBe(true);
    expect(mode(path.join(BK, r.filename))).toBe(0o600);
  });

  it('importBackup writes the stored archive at 0600 (FA-24ii)', () => {
    const z = new AdmZip(); z.addFile('config.json', Buffer.from('{"ok":1}'));
    const r = backup.importBackup(z.toBuffer());
    expect(r.success).toBe(true);
    expect(mode(path.join(BK, r.filename))).toBe(0o600);
  });
});

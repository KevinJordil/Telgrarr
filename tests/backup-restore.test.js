import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

const tmp = path.join(os.tmpdir(), `telgrarr-restore-${process.pid}-${Date.now()}`);
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

describe('backup.restoreBackup — hardened', () => {
  it('restores valid manifest files into DATA_DIR and cleans temp', async () => {
    makeZip('ok.zip', { 'auth.json': '{"a":1}', 'config.json': '{"b":2}' });
    const r = backup.restoreBackup('ok.zip');
    expect(r.success).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(DATA, 'auth.json'), 'utf8'))).toEqual({ a: 1 });
    expect(JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'))).toEqual({ b: 2 });
    expect(fs.readdirSync(BK).some(n => n.startsWith('.restore_tmp_'))).toBe(false);
  });

  it('aborts on a corrupt JSON entry and leaves live files untouched', () => {
    fs.writeFileSync(path.join(DATA, 'config.json'), '{"orig":true}');
    makeZip('bad.zip', { 'auth.json': '{"a":1}', 'config.json': 'NOT-JSON{' });
    const r = backup.restoreBackup('bad.zip');
    expect(r.success).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'))).toEqual({ orig: true });
    expect(fs.existsSync(path.join(DATA, 'auth.json'))).toBe(false); // nothing swapped
  });

  it('ignores non-manifest (path-traversal) entries — zip-slip safe', () => {
    makeZip('slip.zip', { 'auth.json': '{"a":1}', '../evil.json': '{"x":1}' });
    const r = backup.restoreBackup('slip.zip');
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(BK, 'evil.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'evil.json'))).toBe(false);
  });
});

describe('backup.safeBackupName + traversal guard (BK-1)', () => {
  it('rejects path-traversal on restore/delete', () => {
    expect(backup.restoreBackup('../data/config.json').success).toBe(false);
    expect(backup.deleteBackup('..%2Fconfig.json').success).toBe(false);
  });
  it('accepts bare .zip basenames, rejects the rest', () => {
    expect(backup.safeBackupName('telgrarr-backup-1.0.0-20260101.zip')).toBe(true);
    expect(backup.safeBackupName('../x.zip')).toBe(false);
    expect(backup.safeBackupName('x.json')).toBe(false);
  });
});

describe('backup.importBackup (BK-1)', () => {
  it('imports a valid backup buffer into BACKUP_DIR', () => {
    const z = new AdmZip(); z.addFile('config.json', Buffer.from('{"ok":1}'));
    const r = backup.importBackup(z.toBuffer());
    expect(r.success).toBe(true);
    expect(fs.existsSync(path.join(BK, r.filename))).toBe(true);
  });
  it('rejects a non-zip buffer', () => {
    expect(backup.importBackup(Buffer.from('not a zip')).success).toBe(false);
  });
  it('rejects a zip with no recognized manifest entries', () => {
    const z = new AdmZip(); z.addFile('random.txt', Buffer.from('x'));
    expect(backup.importBackup(z.toBuffer()).success).toBe(false);
  });
});

describe('backup metadata (BK-1)', () => {
  it('createBackup embeds backup-meta.json stamped with the app version', () => {
    fs.writeFileSync(path.join(DATA, 'config.json'), '{"x":1}');
    const r = backup.createBackup();
    expect(r.success).toBe(true);
    const z = new AdmZip(path.join(BK, r.filename));
    const meta = JSON.parse(z.getEntry('backup-meta.json').getData().toString('utf8'));
    expect(meta.version).toBe(require('../package.json').version);
    expect(Array.isArray(meta.files)).toBe(true);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// F2 regression: a restore on a NON-restart-capable host must hot-reload live config
// from the just-restored config.json, so a later config.save() merges onto restored
// truth instead of clobbering it back to stale pre-restore memory. Force non-capable
// deterministically (independent of PM2_HOME) BEFORE requiring config/restart.
process.env.RESTART_CAPABLE = '0';
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-bkr-'));
const DATA = path.join(TMP, 'data');
const BK   = path.join(TMP, 'backups');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BK,   { recursive: true });
process.env.DATA_DIR   = DATA;
process.env.BACKUP_DIR = BK;
process.env.LOGS_DIR   = path.join(TMP, 'logs');

const express      = require('express');
const AdmZip       = require('adm-zip');
const config       = require('../src/config.js');
const authRouter   = require('../src/routes/auth.routes.js');
const backupsRouter = require('../src/routes/backups.routes.js');

let server, base, cookie;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  app.use('/api', backupsRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  // requireAuth is cookie-only — mint a session via the first-run setup endpoint.
  const r = await fetch(`${base}/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'supersecret', confirm: 'supersecret' }),
  });
  const setCookie = r.headers.get('set-cookie');
  cookie = setCookie ? setCookie.split(';')[0] : '';
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  delete process.env.RESTART_CAPABLE; // behavior-flipping flag — do not leak to other suites
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

function writeBackupZip(name, files) {
  const zip = new AdmZip();
  for (const [n, c] of Object.entries(files)) zip.addFile(n, Buffer.from(c));
  zip.writeZip(path.join(BK, name));
}

describe('F2 — non-capable restore hot-reloads and cannot be clobbered', () => {
  it('returns restartCapable:false + needsRestart:true and syncs live config to restored disk', async () => {
    writeBackupZip('telgrarr-backup-1.0.0-20260101000000.zip', {
      'config.json': JSON.stringify({ __restoreMarker: 'RESTORED', logging: { level: 'info' } }),
    });
    const res = await fetch(`${base}/backups/restore/telgrarr-backup-1.0.0-20260101000000.zip`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, needsRestart: true, restartCapable: false });
    // Live config now reflects the restored disk (route hot-reloaded it).
    expect(config.__restoreMarker).toBe('RESTORED');
  });

  it('a subsequent config.save() merges onto restored truth (no clobber)', async () => {
    const saved = await config.save({ logging: { level: 'warn' } });
    expect(saved).toBeTruthy();
    const onDisk = JSON.parse(fs.readFileSync(path.join(DATA, 'config.json'), 'utf8'));
    expect(onDisk.__restoreMarker).toBe('RESTORED'); // survived — would be lost pre-fix
    expect(onDisk.logging.level).toBe('warn');        // the new patch applied
  });
});

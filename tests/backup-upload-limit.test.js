import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// R2: an over-limit upload must return 413 (not a generic 500), and the inserted
// error handler must stay transparent to a valid upload (still 200). Real route +
// real express.raw('25mb') limit, exercised over an ephemeral loopback port.
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-r2-'));
const DATA = path.join(TMP, 'data');
const BK   = path.join(TMP, 'backups');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BK,   { recursive: true });
process.env.DATA_DIR   = DATA;
process.env.BACKUP_DIR = BK;
process.env.LOGS_DIR   = path.join(TMP, 'logs');

const express       = require('express');
const AdmZip        = require('adm-zip');
require('../src/config.js');
const authRouter    = require('../src/routes/auth.routes.js');
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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

describe('R2 — upload size-limit maps to 413; valid upload still 200', () => {
  it('returns 413 for an over-limit (>25MB) application/zip body', async () => {
    const oversized = Buffer.alloc(26 * 1024 * 1024 + 1, 0x41); // > the 25mb parser limit
    const res = await fetch(`${base}/backups/upload`, {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/zip' },
      body: oversized,
    });
    expect(res.status).toBe(413);
    expect((await res.json()).success).toBe(false);
  });

  it('still accepts a valid backup zip (error handler transparent on success)', async () => {
    const zip = new AdmZip();
    zip.addFile('config.json', Buffer.from('{"ok":1}'));
    const res = await fetch(`${base}/backups/upload`, {
      method: 'POST',
      headers: { Cookie: cookie, 'content-type': 'application/zip' },
      body: zip.toBuffer(),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(fs.existsSync(path.join(BK, body.filename))).toBe(true);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tmpRoot = path.join(os.tmpdir(), `telgrarr-perms-${process.pid}-${Date.now()}`);
const dataDir = path.join(tmpRoot, 'data');
process.env.DATA_DIR = dataDir;                 // set BEFORE config/auth load (PR-1 mkdir creates it)

const config = require('../src/config');
const auth   = require('../src/middlewares/auth');

afterAll(() => { if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true }); });

const mode = (f) => fs.statSync(f).mode & 0o777;

describe('secret-bearing state files are written 0600 (PR-2)', () => {
  it('config.save writes config.json owner-only', async () => {
    await config.save({ telegram: { delayMs: 4000 } });   // != default 3000 => dirty => write
    const f = path.join(dataDir, 'config.json');
    expect(fs.existsSync(f)).toBe(true);
    expect(mode(f)).toBe(0o600);
    JSON.parse(fs.readFileSync(f, 'utf8'));
  });

  it('flushSessions writes sessions.json owner-only', async () => {
    auth.activeSessions.set('tok-1', Date.now() + 60000);
    await auth.flushSessions();
    const f = path.join(dataDir, 'sessions.json');
    expect(fs.existsSync(f)).toBe(true);
    expect(mode(f)).toBe(0o600);
    JSON.parse(fs.readFileSync(f, 'utf8'));
  });

  it('gen-recovery writes recovery.json under DATA_DIR, owner-only', () => {
    const recDir = path.join(tmpRoot, 'rec');     // distinct dir => also proves DATA_DIR portability
    const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'gen-recovery.js')], {
      env: { ...process.env, DATA_DIR: recDir }, encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    const f = path.join(recDir, 'recovery.json');
    expect(fs.existsSync(f)).toBe(true);          // written to DATA_DIR, not <root>/data
    expect(mode(f)).toBe(0o600);
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    expect(typeof j.token).toBe('string');
    expect(typeof j.expiry).toBe('number');
  });
});

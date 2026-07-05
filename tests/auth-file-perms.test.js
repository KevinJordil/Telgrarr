import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
const require = createRequire(import.meta.url);

// FA-13 (Master §7 D-E): 4 writeAtomic.sync sites in auth.routes.js were
// missing an explicit mode, relying only on write-file-atomic's mode
// PRESERVATION of an already-0600 file. This suite proves each site now
// sets 0600 explicitly by corrupting the on-disk mode to 0644 immediately
// before that site fires, then asserting the write heals it.
//
// DI STUB: ../auth/credentials is replaced with a controlled fake so every
// branch fires deterministically without depending on real hash internals.
// This suite tests FILE-MODE persistence only (credential correctness is
// covered by setup-auth.test.js / the credentials-owning suites).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-authperms-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

function stub(p, exports) {
  const id = require.resolve(p);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../src/auth/credentials', {
  hashNew: () => ({ algo: 'stub', salt: 'stub', hash: 'stub' }),
  verify: () => true,
  needsUpgrade: () => true,
});

const express = require('express');
const authRouter = require('../src/routes/auth.routes.js');

const AUTH_FILE = path.join(TMP, 'auth.json');
const SESSION_FILE = path.join(TMP, 'sessions.json');
const RECOVERY_FILE = path.join(TMP, 'recovery.json');
const mode = (f) => fs.statSync(f).mode & 0o777;

let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

const postJson = (urlPath, body, cookie) =>
  fetch(`${base}${urlPath}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });

let sessionCookie;

describe('FA-13 auth.routes.js secret-file writes are 0600 at every site', () => {
  it('site 1 (persistNow via /auth/setup): sessions.json created 0600 fresh', async () => {
    const r = await postJson('/auth/setup', { username: 'admin', password: 'longenough1', confirm: 'longenough1' });
    expect(r.status).toBe(200);
    const setCookie = r.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    sessionCookie = setCookie.split(';')[0];
    expect(fs.existsSync(SESSION_FILE)).toBe(true);
    expect(mode(SESSION_FILE)).toBe(0o600);
  });

  it('site 2 (/login credential-upgrade branch): corrupted auth.json mode is repaired to 0600', async () => {
    fs.chmodSync(AUTH_FILE, 0o644);
    expect(mode(AUTH_FILE)).toBe(0o644);
    const r = await postJson('/login', { username: 'admin', password: 'longenough1' });
    expect(r.status).toBe(200);
    expect(mode(AUTH_FILE)).toBe(0o600);
  });

  it('site 3 (/auth/password): corrupted auth.json mode is repaired to 0600', async () => {
    fs.chmodSync(AUTH_FILE, 0o644);
    expect(mode(AUTH_FILE)).toBe(0o644);
    const r = await postJson('/auth/password', { currentPassword: 'longenough1', newPassword: 'longenough2' }, sessionCookie);
    expect(r.status).toBe(200);
    expect(mode(AUTH_FILE)).toBe(0o600);
  });

  it('site 4 (/auth/recover): corrupted auth.json mode is repaired to 0600', async () => {
    fs.chmodSync(AUTH_FILE, 0o644);
    expect(mode(AUTH_FILE)).toBe(0o644);
    const token = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(RECOVERY_FILE, JSON.stringify({ token, expiry: Date.now() + 60000 }));
    const r = await postJson('/auth/recover', { recoveryToken: token, newPassword: 'longenough3' });
    expect(r.status).toBe(200);
    expect(mode(AUTH_FILE)).toBe(0o600);
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-6c (Master Section 7, SD-18 "regenerate-only, never user-typed"): POST
// /api/settings let webhookSecret pass through unvalidated (the sanctioned
// non-schema loose key) and config.save()'s mask-strip only iterates schema
// secret fields, so a direct POST could set/blank/mask-literal the webhook
// secret outside the regenerate flow. This suite proves the new route-level
// guard rejects every such payload with 400 BEFORE config.save() runs, leaves
// the on-disk secret untouched, lets a payload with no webhookSecret key
// through unaffected (using {} -- no schema-shape guess needed, since an
// empty object trivially clears validateSettings/needsRestart/isDirty), and
// proves POST /settings/webhook/regenerate (a config.save() call OUTSIDE this
// route) is unaffected. Same DI-stub + ephemeral-port harness as
// auth-file-perms.test.js, extended to also mount settings.routes.js so a
// real session cookie (via the real /auth/setup flow) authenticates it.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-settingsguard-'));
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
const settingsRouter = require('../src/routes/settings.routes.js');
const { SECRET_MASK } = require('../src/settings/secrets');

const CONFIG_FILE = path.join(TMP, 'config.json');
const readStoredSecret = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')).webhookSecret;

let server, base, sessionCookie;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  app.use('/api', settingsRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const setupRes = await fetch(`${base}/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'longenough1', confirm: 'longenough1' }),
  });
  const setCookie = setupRes.headers.get('set-cookie');
  sessionCookie = setCookie.split(';')[0];
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

const postSettings = (body) =>
  fetch(`${base}/settings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: sessionCookie },
    body: JSON.stringify(body),
  });

describe('FA-6c POST /api/settings rejects webhookSecret (regenerate-only)', () => {
  let originalSecret;

  it('records the auto-generated secret before any guard test runs', () => {
    originalSecret = readStoredSecret();
    expect(typeof originalSecret).toBe('string');
    expect(originalSecret.length).toBeGreaterThan(0);
  });

  it('rejects an explicit value with 400 and leaves the on-disk secret unchanged', async () => {
    const r = await postSettings({ webhookSecret: 'attacker-supplied-value' });
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.field).toBe('webhookSecret');
    expect(readStoredSecret()).toBe(originalSecret);
  });

  it('rejects an empty-string blank attempt with 400 and leaves the secret unchanged', async () => {
    const r = await postSettings({ webhookSecret: '' });
    expect(r.status).toBe(400);
    expect(readStoredSecret()).toBe(originalSecret);
  });

  it('rejects the literal mask sentinel (would otherwise persist AS the secret) with 400', async () => {
    const r = await postSettings({ webhookSecret: SECRET_MASK });
    expect(r.status).toBe(400);
    expect(readStoredSecret()).toBe(originalSecret);
  });

  it('lets a payload with no webhookSecret key through unaffected (parity)', async () => {
    const r = await postSettings({});
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(readStoredSecret()).toBe(originalSecret);
  });

  it('POST /settings/webhook/regenerate (outside this route) still works and changes the secret', async () => {
    const r = await fetch(`${base}/settings/webhook/regenerate`, {
      method: 'POST',
      headers: { cookie: sessionCookie },
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(readStoredSecret()).not.toBe(originalSecret);
  });
});

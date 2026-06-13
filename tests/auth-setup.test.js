import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// Isolate ALL state under a temp DATA_DIR set BEFORE requiring config/router.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-h7-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

const express = require('express');
const authRouter = require('../src/routes/auth.routes.js');

let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  // ND-5: ephemeral port (0) on loopback - never the app port.
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

const postSetup = (body) =>
  fetch(`${base}/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const status = async () => (await (await fetch(`${base}/auth/setup-status`)).json()).configured;

describe('H7.1 first-run setup endpoint', () => {
  it('reports unconfigured before any account', async () => {
    expect(await status()).toBe(false);
  });
  it('rejects empty username / short password / mismatch and stays unconfigured', async () => {
    expect((await postSetup({ username: '', password: 'longenough', confirm: 'longenough' })).status).toBe(400);
    expect((await postSetup({ username: 'admin', password: 'short', confirm: 'short' })).status).toBe(400);
    expect((await postSetup({ username: 'admin', password: 'longenough', confirm: 'nope' })).status).toBe(400);
    expect(await status()).toBe(false);
  });
  it('creates the admin, sets a session cookie, persists auth.json', async () => {
    const r = await postSetup({ username: 'admin', password: 'supersecret', confirm: 'supersecret' });
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
    expect(r.headers.get('set-cookie')).toBeTruthy();
    expect(fs.existsSync(path.join(TMP, 'auth.json'))).toBe(true);
  });
  it('reports configured and refuses a second setup (409)', async () => {
    expect(await status()).toBe(true);
    expect((await postSetup({ username: 'evil', password: 'supersecret', confirm: 'supersecret' })).status).toBe(409);
  });
  it('the created account can log in', async () => {
    const r = await fetch(`${base}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'supersecret' }) });
    expect(r.status).toBe(200);
    expect((await r.json()).success).toBe(true);
  });
});

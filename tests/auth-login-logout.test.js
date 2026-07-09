import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// TD-1: isolate ALL state under a temp DATA_DIR set BEFORE requiring config/router.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-loginlogout-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

const express = require('express');
const authRouter = require('../src/routes/auth.routes.js');

let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const r = await fetch(`${base}/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'longenough1', confirm: 'longenough1' }),
  });
  if (r.status !== 200) throw new Error('setup bootstrap failed in test harness');
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

describe('D-1a (FA-14): /login no longer returns a raw token; /logout Bearer-header path removed', () => {
  it('[PARITY-CHANGE] /login succeeds, sets a session cookie, and the JSON body carries NO token field', async () => {
    const r = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'longenough1' }),
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toBeTruthy();
    const body = await r.json();
    expect(body).toEqual({ success: true });
    expect('token' in body).toBe(false);
  });

  it('logout still works cookie-only (parity): session actually invalidated, subsequent authed call 401s', async () => {
    const loginRes = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'longenough1' }),
    });
    const cookie = loginRes.headers.get('set-cookie').split(';')[0];

    const logoutRes = await fetch(`${base}/logout`, { method: 'POST', headers: { cookie } });
    expect(logoutRes.status).toBe(200);
    expect((await logoutRes.json()).success).toBe(true);

    const pwRes = await fetch(`${base}/auth/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ currentPassword: 'longenough1', newPassword: 'shouldnotapply' }),
    });
    expect(pwRes.status).toBe(401);
  });

  it('[PARITY-CHANGE] a Bearer-only Authorization header no longer authenticates /logout: the session survives untouched', async () => {
    const loginRes = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'longenough1' }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    const cookie = setCookie.split(';')[0];
    const rawToken = setCookie.split(';')[0].split('=')[1];

    const bearerLogout = await fetch(`${base}/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${rawToken}` },
    });
    expect(bearerLogout.status).toBe(200);

    const pwRes = await fetch(`${base}/auth/password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ currentPassword: 'longenough1', newPassword: 'longenough2' }),
    });
    expect(pwRes.status).toBe(200);
  });
});

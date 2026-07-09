import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-composed-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

// Swappable auth delegate (history-routes.test.js pattern) layered onto the
// real-server/ephemeral-port harness (templates-layout-route.test.js pattern):
// we need BOTH a genuine 401 case AND a faithful real-module/real-disk round
// trip (SLOT DEC-SLOT-6 assertion set), which neither existing harness alone provides.
let authMiddleware;
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
stub('../src/middlewares/auth.js', { requireAuth: (req, res, next) => authMiddleware(req, res, next) });
stub('../src/events.js', { emit: () => {} });

const express = require('express');
const templatesRouter = require('../src/routes/templates.routes.js');
const { resolveComposed } = require('../src/templates/layout-fragments.js');
const { resolveLang } = require('../src/routes/preview.routes.js');
const templates = require('../src/templates.js');

let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', templatesRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});
beforeEach(() => {
  authMiddleware = (req, res, next) => next();
});

describe('SLOT DEC-SLOT-6: GET /api/templates/composed', () => {
  it('401 when unauthenticated', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    const r = await fetch(`${base}/templates/composed?kind=sonarr`);
    expect(r.status).toBe(401);
  });

  it('400 on missing kind', async () => {
    const r = await fetch(`${base}/templates/composed`);
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(typeof body.error).toBe('string');
  });

  it('400 on invalid kind', async () => {
    const r = await fetch(`${base}/templates/composed?kind=bogus`);
    expect(r.status).toBe(400);
  });

  it('200 sonarr at an explicit lang matches the real resolveComposed oracle', async () => {
    const r = await fetch(`${base}/templates/composed?kind=sonarr&lang=es`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const oracle = resolveComposed('sonarr', 'DEFAULT_AR', 'es', templates.getLayout().sonarr);
    expect(body).toEqual({ kind: 'sonarr', lang: 'es', template: oracle.template });
  });

  it('200 radarr at an explicit lang matches the real resolveComposed oracle', async () => {
    const r = await fetch(`${base}/templates/composed?kind=radarr&lang=fr`);
    expect(r.status).toBe(200);
    const body = await r.json();
    const oracle = resolveComposed('radarr', 'DEFAULT_AR', 'fr', templates.getLayout().radarr);
    expect(body).toEqual({ kind: 'radarr', lang: 'fr', template: oracle.template });
  });

  it('lang omitted resolves via the real resolveLang (parity with preview.routes.js)', async () => {
    const r = await fetch(`${base}/templates/composed?kind=sonarr`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.lang).toBe(resolveLang(undefined));
  });

  it('invalid lang falls back the same way resolveLang does', async () => {
    const r = await fetch(`${base}/templates/composed?kind=radarr&lang=zz`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.lang).toBe(resolveLang('zz'));
  });

  it('is read-only: templates.json never materializes in a fresh DATA_DIR', async () => {
    await fetch(`${base}/templates/composed?kind=sonarr&lang=de`);
    await fetch(`${base}/templates/composed?kind=radarr&lang=pt`);
    expect(fs.existsSync(path.join(TMP, 'templates.json'))).toBe(false);
  });
});

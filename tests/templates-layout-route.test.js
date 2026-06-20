import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-layout-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

// Pass-through auth (gate covered elsewhere) + no-op events (hermetic, no SSE side effects),
// injected BEFORE the router is required. templates/config load for real -> faithful persist round-trip.
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
stub('../src/middlewares/auth.js', { requireAuth: (req, res, next) => next() });
stub('../src/events.js', { emit: () => {} });

const express = require('express');
const templatesRouter = require('../src/routes/templates.routes.js');
const { DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');

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

const getLayout = () => fetch(`${base}/templates/layout`).then((r) => r.json());
const putLayout = (layout) =>
  fetch(`${base}/templates/layout`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ layout }) });

describe('P5(a): /api/templates/layout', () => {
  it('GET returns the current layout (sonarr + radarr arrays)', async () => {
    const l = await getLayout();
    expect(Array.isArray(l.sonarr)).toBe(true);
    expect(Array.isArray(l.radarr)).toBe(true);
  });

  it('PUT persists a valid reorder and GET reflects it', async () => {
    const [a, b, c] = DEFAULT_ORDER.sonarr;
    const next = { sonarr: [b, { key: a, enabled: false }, c], radarr: DEFAULT_ORDER.radarr.slice() };
    const r = await putLayout(next);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.success).toBe(true);
    expect(body.layout.sonarr).toEqual([b, { key: a, enabled: false }, c]);
    expect((await getLayout()).sonarr).toEqual([b, { key: a, enabled: false }, c]);
  });

  it('PUT rejects a malformed layout with 400', async () => {
    expect((await putLayout(null)).status).toBe(400);
    expect((await putLayout({ sonarr: DEFAULT_ORDER.sonarr.slice() })).status).toBe(400);
    expect((await putLayout({ sonarr: 'x', radarr: [] })).status).toBe(400);
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-bltitles-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
stub('../src/middlewares/auth.js', { requireAuth: (req, res, next) => next() });
stub('../src/events.js', { emit: () => {} });

const axios = require('axios');
const blacklist = require('../src/blacklist.js');
const express = require('express');
const blacklistRouter = require('../src/routes/blacklist.routes.js');

const FILE = path.join(TMP, 'blacklist.json');
function resetBlacklist() {
  try { fs.rmSync(FILE, { force: true }); } catch { /* noop */ }
  try { fs.rmSync(`${FILE}.lock`, { recursive: true, force: true }); } catch { /* noop */ }
  blacklist.load();
}

let server, base;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', blacklistRouter);
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

beforeEach(() => { resetBlacklist(); });
afterEach(() => { vi.restoreAllMocks(); });

afterAll(async () => {
  await new Promise((r) => server.close(r));
  resetBlacklist();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

const getTitles = (type) =>
  fetch(`${base}/blacklist/titles?type=${type}`).then(async (r) => ({ status: r.status, body: await r.json() }));

describe('GET /api/blacklist/titles', () => {
  it('rejects an invalid type with 400', async () => {
    const { status, body } = await getTitles('bogus');
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it('returns an empty array when nothing is blacklisted', async () => {
    const { status, body } = await getTitles('sonarr');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('reverse-enriches each blacklisted id from the source *arr instance, preserving order', async () => {
    await blacklist.addId('sonarr', 10);
    await blacklist.addId('sonarr', 20);
    vi.spyOn(axios, 'get').mockImplementation((url) => {
      if (url.endsWith('/10')) return Promise.resolve({ data: { title: 'Show Ten', year: 2019, images: [{ coverType: 'poster', remoteUrl: 'http://x/10.jpg' }] } });
      if (url.endsWith('/20')) return Promise.resolve({ data: { title: 'Show Twenty', year: 2021, images: [] } });
      return Promise.reject(new Error('unexpected url'));
    });
    const { status, body } = await getTitles('sonarr');
    expect(status).toBe(200);
    expect(body).toEqual([
      { id: 10, title: 'Show Ten', year: 2019, posterUrl: 'http://x/10.jpg', available: true },
      { id: 20, title: 'Show Twenty', year: 2021, posterUrl: null, available: true },
    ]);
  });

  it('isolates a failed lookup: one dead id degrades, its sibling still resolves', async () => {
    await blacklist.addId('radarr', 30);
    await blacklist.addId('radarr', 40);
    vi.spyOn(axios, 'get').mockImplementation((url) => {
      if (url.endsWith('/30')) return Promise.reject(new Error('404 Not Found'));
      if (url.endsWith('/40')) return Promise.resolve({ data: { title: 'Movie Forty', year: 2022, remotePoster: 'http://x/40.jpg' } });
      return Promise.reject(new Error('unexpected url'));
    });
    const { status, body } = await getTitles('radarr');
    expect(status).toBe(200);
    expect(body).toEqual([
      { id: 30, title: null, year: null, posterUrl: null, available: false },
      { id: 40, title: 'Movie Forty', year: 2022, posterUrl: 'http://x/40.jpg', available: true },
    ]);
  });

  it('prefers radarr remotePoster over images[] when both are present', async () => {
    await blacklist.addId('radarr', 50);
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: { title: 'Movie Fifty', year: 2020, remotePoster: 'http://x/remote.jpg', images: [{ coverType: 'poster', remoteUrl: 'http://x/local.jpg' }] },
    });
    const { body } = await getTitles('radarr');
    expect(body[0].posterUrl).toBe('http://x/remote.jpg');
  });

  it('rejects an invalid type before touching the network (no axios call made)', async () => {
    const spy = vi.spyOn(axios, 'get');
    await getTitles('bogus');
    expect(spy).not.toHaveBeenCalled();
  });
});

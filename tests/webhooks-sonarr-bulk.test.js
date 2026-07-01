import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-bulk-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
const tmpQueue = path.join(TMP, 'media_queue.json');
config.queueFile = tmpQueue;
function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
stub('../src/auth/webhook-token.js', { tokenValid: () => true });
let sweepCount = 0;
stub('../src/sweeper.js', { scheduleSweep: () => { sweepCount++; } });
const queueMod = require('../src/queue.js');
const realEnqueue     = queueMod.enqueue;
const realEnqueueMany = queueMod.enqueueMany;
let enqueueCalls = 0;
let enqueueManyCalls = [];
queueMod.enqueue     = async (item)  => { enqueueCalls++; return realEnqueue(item); };
queueMod.enqueueMany = async (items) => { enqueueManyCalls.push(items); return realEnqueueMany(items); };
const events = require('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');
const emitted = [];
const origEmit = events.emit.bind(events);
events.emit = (...a) => { emitted.push(a); return origEmit(...a); };
const express = require('express');
const webhooks = require('../src/routes/webhooks.routes.js');
let server, base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(webhooks);
  await new Promise((res) => { server = app.listen(0, '127.0.0.1', res); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
});
beforeEach(() => {
  fs.writeFileSync(tmpQueue, '[]', 'utf8');
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
  emitted.length = 0; sweepCount = 0; enqueueCalls = 0; enqueueManyCalls = [];
});
const eps = (...n) => n.map((x) => ({ id: 1000 + x, seasonNumber: 1, episodeNumber: x, title: `Ep ${x}` }));
const post = (episodes) => fetch(`${base}/anytoken/sonarr`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    eventType: 'Download',
    series: { id: 42, title: 'Test Show', path: '/tv/test' },
    episodes,
    episodeFile: { quality: { quality: { name: 'WEBDL-1080p' } } },
  }),
});
const settle = () => new Promise((r) => setTimeout(r, 80));
const queuedEvents = () => emitted.filter((a) => a[0] === EVENT_TYPES.QUEUE_ITEM_ADDED);
describe('Sonarr webhook bulk enqueue (BLR-1 / DEC-BLR-4)', () => {
  it('20-episode payload → enqueueMany ONCE, enqueue NEVER', async () => {
    const r = await post(eps(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20));
    expect(r.status).toBe(200);
    await settle();
    expect(enqueueManyCalls.length).toBe(1);
    expect(enqueueManyCalls[0]).toHaveLength(20);
    expect(enqueueCalls).toBe(0);
    expect(enqueueManyCalls[0][0].source).toBe('sonarr');
    expect(enqueueManyCalls[0][0].seriesId).toBe(42);
    expect(enqueueManyCalls[0][0].quality).toBe('WEBDL-1080p');
    expect(sweepCount).toBe(1);
  });
  it('queuedCount byte-identical: queue file contains all 20 distinct episodes', async () => {
    await post(eps(1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20));
    await settle();
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored).toHaveLength(20);
    const evt = queuedEvents();
    expect(evt).toHaveLength(1);
    expect(evt[0][4].count).toBe(20);
  });
  it('single-episode payload still routes through enqueueMany (uniform Sonarr path)', async () => {
    await post(eps(7));
    await settle();
    expect(enqueueManyCalls.length).toBe(1);
    expect(enqueueManyCalls[0]).toHaveLength(1);
    expect(sweepCount).toBe(1);
  });
});

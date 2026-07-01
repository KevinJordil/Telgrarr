import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-whdup-'));
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
let enqueueManyCalls = 0;
queueMod.enqueue     = async (item)  => { const r = await realEnqueue(item);     enqueueCalls++;     return r; };
queueMod.enqueueMany = async (items) => { const r = await realEnqueueMany(items); enqueueManyCalls++; return r; };

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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});
beforeEach(() => {
  fs.writeFileSync(tmpQueue, '[]', 'utf8');
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch { /* noop */ }
  emitted.length = 0; sweepCount = 0; enqueueCalls = 0; enqueueManyCalls = 0;
});

const eps = (...n) => n.map((x) => ({ id: 1000 + x, seasonNumber: 1, episodeNumber: x }));
const post = (episodes) => fetch(`${base}/anytoken/sonarr`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ eventType: 'Download', series: { id: 42, title: 'Test Show', path: '/tv/test' }, episodes }),
});
const until = async (pred, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error('timeout waiting for webhook async processing');
};
const settle = () => new Promise((r) => setTimeout(r, 40));
const queuedEvents = () => emitted.filter((a) => a[0] === EVENT_TYPES.QUEUE_ITEM_ADDED);

describe('Webhook QUEUE_ITEM_ADDED reflects deduped enqueue (live-feed honesty)', () => {
  it('in-payload duplicates (8 distinct + 8 repeats) => count 8, queue 8, one sweep', async () => {
    const r = await post([...eps(1,2,3,4,5,6,7,8), ...eps(1,2,3,4,5,6,7,8)]);
    expect(r.status).toBe(200);
    await until(() => enqueueManyCalls >= 1); await settle();
    expect((await queueMod.getQueue()).length).toBe(8);
    expect(queuedEvents().length).toBe(1);
    expect(queuedEvents()[0][4].count).toBe(8);
    expect(sweepCount).toBe(1);
  });
  it('duplicate repeat webhook => no phantom event, no extra sweep, no queue growth', async () => {
    await post(eps(1,2,3,4,5,6,7,8));
    await until(() => enqueueManyCalls >= 1); await settle();
    expect((await queueMod.getQueue()).length).toBe(8);
    expect(queuedEvents().length).toBe(1);
    expect(queuedEvents()[0][4].count).toBe(8);
    expect(sweepCount).toBe(1);
    await post(eps(1,2,3,4,5,6,7,8));
    await until(() => enqueueManyCalls >= 2); await settle();
    expect((await queueMod.getQueue()).length).toBe(8);
    expect(queuedEvents().length).toBe(1);
    expect(sweepCount).toBe(1);
  });
  it('clean single-episode POST => count 1, queue 1, one sweep', async () => {
    await post(eps(4));
    await until(() => enqueueManyCalls >= 1); await settle();
    expect((await queueMod.getQueue()).length).toBe(1);
    expect(queuedEvents().length).toBe(1);
    expect(queuedEvents()[0][4].count).toBe(1);
    expect(sweepCount).toBe(1);
  });
});

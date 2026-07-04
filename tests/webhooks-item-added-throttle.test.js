import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-throttle-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

const config = require("../src/config.js");

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}
stub('../src/auth/webhook-token.js', { tokenValid: () => true });
stub('../src/sweeper.js', { scheduleSweep: () => {} });
// Queue persistence/locking is exercised by webhooks-sonarr-bulk.test.js and
// webhooks-dedup-count.test.js. This suite isolates the emitThrottled wiring
// itself (BCS F3/SD-4): enqueue/enqueueMany are stubbed to resolve instantly
// so real file-lock timing (irrelevant to the behavior under test) can never
// push a call outside the 1000ms throttle window and flake the assertions.
stub('../src/queue.js', {
  enqueue: async () => true,
  enqueueMany: async (items) => items.length,
});

const events = require('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');
const emitted = [];
events.bus.on('event', (e) => { emitted.push(e); });

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
  emitted.length = 0;
  events.resetThrottleState();
});

const postRadarr = (movieId) => fetch(`${base}/anytoken/radarr`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    eventType: 'Download',
    movie: { id: movieId, title: `Movie ${movieId}`, folderPath: `/movies/${movieId}` },
    movieFile: { quality: { quality: { name: 'WEBDL-1080p' } } },
  }),
});
const queuedEvents = () => emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_ITEM_ADDED);
const until = async (pred, ms = 2000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error('timeout waiting for throttle window');
};

describe('Webhook QUEUE_ITEM_ADDED throttling under burst (BCS F3/SD-4)', () => {
  it('20 rapid radarr webhooks within the window => 1 leading + 1 trailing rollup', async () => {
    const N = 20;
    await Promise.all(Array.from({ length: N }, (_, i) => postRadarr(9000 + i)));
    await until(() => queuedEvents().length >= 1);
    await new Promise((r) => setTimeout(r, 1100));
    const evts = queuedEvents();
    expect(evts).toHaveLength(2);
    expect(evts[0].data.coalesced).toBeUndefined();
    expect(evts[1].data.coalesced).toBe(true);
    expect(evts[1].data.count).toBe(N);
  });

  it('a single isolated radarr webhook => exactly 1 event, no trailing rollup', async () => {
    await postRadarr(9500);
    await until(() => queuedEvents().length >= 1);
    await new Promise((r) => setTimeout(r, 1100));
    const evts = queuedEvents();
    expect(evts).toHaveLength(1);
    expect(evts[0].data.coalesced).toBeUndefined();
  });
});

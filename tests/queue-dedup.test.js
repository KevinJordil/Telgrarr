import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const tmpQueue = path.join(os.tmpdir(), `telgrarr-queue-dedup-${process.pid}-${Date.now()}.json`);
config.queueFile = tmpQueue;
const queue = require('../src/queue.js');

function cleanup() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}
beforeEach(() => { cleanup(); fs.writeFileSync(tmpQueue, '[]', 'utf8'); });
afterAll(cleanup);

const son = (seriesId, episodeId, seasonNumber, episodeNumber) =>
  ({ source: 'sonarr', traceId: 't', seriesId, episodeId, seasonNumber, episodeNumber });

describe('Queue identity dedup (duplicate webhook / overlapping triggers)', () => {
  it('same sonarr episode twice => one item; returns true then false', async () => {
    const a = await queue.enqueue(son(5, 101, 1, 1));
    const b = await queue.enqueue(son(5, 101, 1, 1));
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect((await queue.getQueue()).length).toBe(1);
  });
  it('8 distinct + full duplicate set => 8 items (8->16 doubling collapses)', async () => {
    for (let e = 1; e <= 8; e++) await queue.enqueue(son(5, 100 + e, 1, e));
    for (let e = 1; e <= 8; e++) await queue.enqueue(son(5, 100 + e, 1, e));
    expect((await queue.getQueue()).length).toBe(8);
  });
  it('single episode stays length 1 under duplicate (singular label, not plural)', async () => {
    await queue.enqueue(son(9, 900, 2, 4));
    await queue.enqueue(son(9, 900, 2, 4));
    expect((await queue.getQueue()).length).toBe(1);
  });
  it('two distinct episodes both stored', async () => {
    await queue.enqueue(son(5, 101, 1, 1));
    await queue.enqueue(son(5, 102, 1, 2));
    expect((await queue.getQueue()).length).toBe(2);
  });
  it('episodeId absent => season+episode fallback dedups', async () => {
    await queue.enqueue({ source: 'sonarr', traceId: 't', seriesId: 5, seasonNumber: 1, episodeNumber: 1 });
    await queue.enqueue({ source: 'sonarr', traceId: 't', seriesId: 5, seasonNumber: 1, episodeNumber: 1 });
    expect((await queue.getQueue()).length).toBe(1);
  });
  it('radarr movie twice => one item', async () => {
    await queue.enqueue({ source: 'radarr', traceId: 't', movieId: 77 });
    await queue.enqueue({ source: 'radarr', traceId: 't', movieId: 77 });
    expect((await queue.getQueue()).length).toBe(1);
  });
  it('unidentifiable item is not deduped (safe default)', async () => {
    await queue.enqueue({ source: 'unknown', traceId: 't' });
    await queue.enqueue({ source: 'unknown', traceId: 't' });
    expect((await queue.getQueue()).length).toBe(2);
  });
});

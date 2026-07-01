import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const tmpQueue = path.join(os.tmpdir(), `telgrarr-enqmany-${process.pid}-${Date.now()}.json`);
config.queueFile = tmpQueue;
const ORIGINAL_MAX = config.queue.maxItems;
const queue = require('../src/queue.js');
function cleanup() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}
beforeEach(() => { cleanup(); fs.writeFileSync(tmpQueue, '[]', 'utf8'); config.queue.maxItems = 5; });
afterAll(()  => { cleanup(); config.queue.maxItems = ORIGINAL_MAX; });
const son = (sid, ep, tr) => ({ source: 'sonarr', traceId: tr || `t${ep}`, seriesId: sid, seasonNumber: 1, episodeNumber: ep });
describe('Queue enqueueMany (BLR-1 / DEC-BLR-4)', () => {
  it('adds N items in one call; returns count added; queue length matches', async () => {
    const added = await queue.enqueueMany([son(100,1), son(100,2), son(100,3)]);
    expect(added).toBe(3);
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored).toHaveLength(3);
    expect(stored[0].episodeNumber).toBe(1);
    expect(stored[2].episodeNumber).toBe(3);
  });
  it('uses ONE lockfile.lock acquisition for N items (single-lock contract)', async () => {
    const lockfile = require('proper-lockfile');
    const origLock = lockfile.lock;
    let lockCalls = 0;
    lockfile.lock = async (...args) => { lockCalls++; return origLock.call(lockfile, ...args); };
    try {
      const items = Array.from({ length: 20 }, (_, i) => son(200, i + 1));
      await queue.enqueueMany(items);
      expect(lockCalls).toBe(1);
    } finally { lockfile.lock = origLock; }
  });
  it('per-item identityKey dedup is preserved (existing-duplicate skipped)', async () => {
    await queue.enqueue(son(300, 5, 't1'));
    const added = await queue.enqueueMany([son(300, 5, 't2'), son(300, 6, 't2')]);
    expect(added).toBe(1);
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored.map((e) => e.episodeNumber).sort()).toEqual([5, 6]);
  });
  it('partial dedup within the batch: returns count of newly-added only', async () => {
    await queue.enqueue(son(400, 1));
    await queue.enqueue(son(400, 2));
    const added = await queue.enqueueMany([son(400,1), son(400,3), son(400,2), son(400,4)]);
    expect(added).toBe(2);
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored.map((e) => e.episodeNumber).sort()).toEqual([1, 2, 3, 4]);
  });
  it('dedup within the batch itself (self-duplicates collapse)', async () => {
    const added = await queue.enqueueMany([son(500,1), son(500,1), son(500,2)]);
    expect(added).toBe(2);
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored).toHaveLength(2);
  });
  it('overflow applied ONCE for the whole batch; oldest evicted; final length === maxItems', async () => {
    // maxItems=5; fill to 4; add 3 more (projected 7) → evict 2 oldest → final 5
    for (let i = 1; i <= 4; i++) await queue.enqueue(son(600, i));
    const added = await queue.enqueueMany([son(700,1), son(700,2), son(700,3)]);
    expect(added).toBe(3);
    const stored = JSON.parse(fs.readFileSync(tmpQueue, 'utf8'));
    expect(stored).toHaveLength(5);
    expect(stored[0].seriesId).toBe(600);
    expect(stored[0].episodeNumber).toBe(3);  // ep 1,2 evicted
    expect(stored[2].seriesId).toBe(700);
    expect(stored[4].seriesId).toBe(700);
  });
  it('empty array is a no-op (returns 0; queue untouched)', async () => {
    await queue.enqueue(son(800, 1));
    const before = fs.readFileSync(tmpQueue, 'utf8');
    expect(await queue.enqueueMany([])).toBe(0);
    expect(fs.readFileSync(tmpQueue, 'utf8')).toBe(before);
  });
});

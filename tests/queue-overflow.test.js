import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const tmpQueue = path.join(os.tmpdir(), `telgrarr-queue-overflow-${process.pid}-${Date.now()}.json`);
config.queueFile = tmpQueue;
const queue = require('../src/queue.js');

function cleanup() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}

const ORIGINAL_MAX = config.queue.maxItems;
beforeEach(() => { cleanup(); fs.writeFileSync(tmpQueue, '[]', 'utf8'); config.queue.maxItems = 5; });
afterAll(() => { cleanup(); config.queue.maxItems = ORIGINAL_MAX; });

const son = (seriesId, episodeId) =>
  ({ source: 'sonarr', traceId: `t${episodeId}`, seriesId, episodeId, seasonNumber: 1, episodeNumber: episodeId });

describe('Queue overflow policy (Phase 3 / G3)', () => {
  it('never exceeds maxItems; oldest is dropped, newest is kept', async () => {
    for (let e = 1; e <= 5; e++) await queue.enqueue(son(1, e));
    expect((await queue.getQueue()).length).toBe(5);

    await queue.enqueue(son(1, 6));
    const q = await queue.getQueue();
    expect(q.length).toBe(5);
    expect(q.find(i => i.episodeId === 1)).toBeUndefined();
    expect(q.find(i => i.episodeId === 6)).toBeDefined();
  });

  it('6 distinct enqueues over maxItems=5: length never exceeds 5 at any point', async () => {
    for (let e = 1; e <= 6; e++) {
      await queue.enqueue(son(2, e));
      const len = (await queue.getQueue()).length;
      expect(len).toBeLessThanOrEqual(5);
    }
  });

  it('an audit log fires on overflow drop', async () => {
    const logger = require('../src/logger.js');
    const auditCalls = [];
    const origAudit = logger.audit;
    logger.audit = (...args) => { auditCalls.push(args); return origAudit.apply(logger, args); };
    try {
      for (let e = 1; e <= 5; e++) await queue.enqueue(son(3, e));
      await queue.enqueue(son(3, 6));
      const overflowCall = auditCalls.find(([, msg]) => msg.includes('Overflow') && msg.includes('Dropped oldest'));
      expect(overflowCall).toBeDefined();
      expect(overflowCall[1]).toContain('capped at 5');
    } finally {
      logger.audit = origAudit;
    }
  });

  it('does not overflow-drop while still under the cap (parity: normal enqueue unaffected)', async () => {
    await queue.enqueue(son(4, 1));
    await queue.enqueue(son(4, 2));
    expect((await queue.getQueue()).length).toBe(2);
  });
});

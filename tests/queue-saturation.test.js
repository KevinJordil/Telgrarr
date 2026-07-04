import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// BCS Phase 5 / F6: pin the lockfile retry budget under real 400+-way webhook-
// burst contention. proper-lockfile is pinned at ^4.1.2 (package.json); its
// documented defaults are stale:10000ms, retries:0 -- queue.js overrides ONLY
// retries:{retries:10,minTimeout:50} with no `factor`, so the underlying `retry`
// package's own default factor:2 applies: a single unlucky waiter's worst-case
// cumulative backoff is ~51s. First run of this test (pre-fix) measured
// 354/408 calls throwing ELOCKED at ~51.7s runtime -- confirmed as INTRA-PROCESS
// contention (RD-8 rules out a second OS process), fixed in src/queue.js via a
// promise-chain mutex (withQueueMutex) serializing this process's own callers
// ahead of the FS lock. Post-fix this test should complete in well under a
// second; the 90s timeout is a safety ceiling against the verified worst case,
// not the expected runtime.
//
// Isolation follows the pattern already proven safe in queue.test.js /
// queue-overflow.test.js / queue-enqueue-many.test.js: direct override of
// config.queueFile + config.queue.maxItems, NOT DATA_DIR/mkdtempSync -- queue.js's
// entire config surface is exactly those two fields.
//
// maxItems is deliberately 600, NOT the production default 1000, so the 800-item
// burst below is FORCED to overflow-evict under real concurrent contention. Every
// item carries a distinct identity key (zero dedup skips ever fire), so the
// outcome is a race-order-independent invariant: cumulative admissions are always
// exactly 800 and cumulative evictions always exactly 200, no matter how the 408
// concurrent calls interleave.
const config = require('../src/config.js');
const events = require('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');

const tmpQueue = path.join(
  os.tmpdir(),
  `telgrarr-queue-saturation-${process.pid}-${Date.now()}.json`
);
config.queueFile = tmpQueue;
const ORIGINAL_MAX = config.queue.maxItems;
const queue = require('../src/queue.js');

function cleanup() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}

beforeEach(() => {
  cleanup();
  fs.writeFileSync(tmpQueue, '[]', 'utf8');
  config.queue.maxItems = 600;
});
afterAll(() => {
  cleanup();
  config.queue.maxItems = ORIGINAL_MAX;
});

const son = (seriesId, episodeNumber) => ({
  source: 'sonarr',
  traceId: `sat-${seriesId}-${episodeNumber}`,
  seriesId,
  seasonNumber: 1,
  episodeNumber,
});

describe('Queue saturation under burst contention (BCS Phase 5 / F6)', () => {
  it(
    '400 concurrent enqueue() + 8 concurrent enqueueMany(50): zero throws, exact final length, exact overflow arithmetic, lock released',
    async () => {
      const dropped = { total: 0 };
      const origEmit = events.emit;
      events.emit = (type, ...rest) => {
        if (type === EVENT_TYPES.QUEUE_OVERFLOW) {
          const payload = rest[rest.length - 1];
          if (payload && typeof payload.droppedCount === 'number') {
            dropped.total += payload.droppedCount;
          }
        }
        return origEmit.call(events, type, ...rest);
      };

      const failures = [];
      try {
        const singleCalls = Array.from({ length: 400 }, (_, i) =>
          queue.enqueue(son(1, i + 1))
        );
        const batchCalls = Array.from({ length: 8 }, (_, b) => {
          const items = Array.from({ length: 50 }, (_, i) => son(1000 + b, i + 1));
          return queue.enqueueMany(items);
        });

        const results = await Promise.allSettled([...singleCalls, ...batchCalls]);
        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length > 0) {
          failures.push(
            `${rejected.length}/${results.length} calls threw: ` +
            rejected.slice(0, 5).map((r) => (r.reason && r.reason.message) || String(r.reason)).join(' | ') +
            (rejected.length > 5 ? ` (+${rejected.length - 5} more)` : '')
          );
        }

        const totalAttempted = 400 + 8 * 50;
        const finalQueue = await queue.getQueue();
        const expectedLength = Math.min(totalAttempted, config.queue.maxItems);

        if (finalQueue.length !== expectedLength) {
          failures.push(`final length ${finalQueue.length} !== expected ${expectedLength}`);
        }
        if (finalQueue.length + dropped.total !== totalAttempted) {
          failures.push(
            `arithmetic mismatch: length(${finalQueue.length}) + dropped(${dropped.total}) !== attempted(${totalAttempted})`
          );
        }
        if (fs.existsSync(`${tmpQueue}.lock`)) {
          failures.push('lock directory still present after burst settled');
        }
      } finally {
        events.emit = origEmit;
      }

      expect(failures).toEqual([]);
    },
    90000
  );
});

import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Redirect config.queueFile to an isolated tmp path BEFORE requiring queue.js;
// queue.js captures QUEUE_FILE = config.queueFile at module load.
const config = require('../src/config.js');
const tmpQueue = path.join(
  os.tmpdir(),
  `telgrarr-queue-test-${process.pid}-${Date.now()}.json`
);
config.queueFile = tmpQueue;

const queue = require('../src/queue.js');

function cleanupQueueFile() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}

afterAll(cleanupQueueFile);

describe('Queue contract (D.2 / C1 / R10)', () => {
  it('valid-empty queue file returns []', async () => {
    cleanupQueueFile();
    fs.writeFileSync(tmpQueue, '[]', 'utf8');
    const q = await queue.getQueue();
    expect(Array.isArray(q)).toBe(true);
    expect(q.length).toBe(0);
  });

  it('missing queue file: ensureQueueFile creates it and getQueue returns []', async () => {
    cleanupQueueFile();
    const q = await queue.getQueue();
    expect(q).toEqual([]);
    expect(fs.existsSync(tmpQueue)).toBe(true);
    expect(fs.readFileSync(tmpQueue, 'utf8')).toBe('[]');
  });

  it('corrupt JSON throws (D.2a flipped read-error path; no swallow to [])', async () => {
    cleanupQueueFile();
    fs.writeFileSync(tmpQueue, '{not valid json', 'utf8');
    await expect(queue.getQueue()).rejects.toThrow();
  });
});

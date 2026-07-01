import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const tmpQueue = path.join(os.tmpdir(), `telgrarr-peek-${process.pid}-${Date.now()}.json`);
config.queueFile = tmpQueue;
const queue = require('../src/queue.js');
function cleanup() {
  try { fs.unlinkSync(tmpQueue); } catch (_) {}
  try { fs.rmSync(`${tmpQueue}.lock`, { recursive: true, force: true }); } catch (_) {}
}
beforeEach(() => cleanup());
afterAll(()  => cleanup());
describe('Queue peekLength (BLR-1 / DEC-BLR-2)', () => {
  it('returns 0 when the queue file is missing (ensureQueueFile creates it as [])', async () => {
    expect(fs.existsSync(tmpQueue)).toBe(false);
    expect(await queue.peekLength()).toBe(0);
    expect(fs.existsSync(tmpQueue)).toBe(true);
    expect(fs.readFileSync(tmpQueue, 'utf8')).toBe('[]');
  });
  it('returns array length after enqueue (mirrors enqueue\'s view)', async () => {
    fs.writeFileSync(tmpQueue, '[]', 'utf8');
    await queue.enqueue({ source: 'sonarr', traceId: 't1', seriesId: 1, episodeId: 1 });
    await queue.enqueue({ source: 'sonarr', traceId: 't2', seriesId: 1, episodeId: 2 });
    expect(await queue.peekLength()).toBe(2);
  });
  it('returns 0 on corrupt/partial JSON snapshot (lock-free best-effort)', async () => {
    fs.writeFileSync(tmpQueue, '{not valid', 'utf8');
    expect(await queue.peekLength()).toBe(0);
  });
  it('does NOT acquire the lockfile (completes while a writer holds the lock)', async () => {
    fs.writeFileSync(tmpQueue, '[]', 'utf8');
    const lockfile = require('proper-lockfile');
    const release = await lockfile.lock(tmpQueue);
    try {
      const len = await Promise.race([
        queue.peekLength(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('peekLength blocked')), 500)),
      ]);
      expect(len).toBe(0);
    } finally { await release(); }
  });
});

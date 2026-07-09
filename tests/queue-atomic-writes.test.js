import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-q-atomic-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');

function stub(rel, exports) {
  const r = require.resolve(rel);
  require.cache[r] = { id: r, filename: r, loaded: true, exports };
}

// Records every write-file-atomic sync() call while delegating to the REAL
// implementation underneath -- proves (a) the right call sites fire, (b) final
// on-disk content is unaffected by the mechanism swap, and (c) every converted
// site carries { fsync: false } (F16/D-3 Architect-ratified divergence: atomicity
// without the per-write fsync latency; a future "cleanup" re-enabling fsync
// silently would fail here, not just slow the hot path invisibly).
const realWriteAtomic = require('write-file-atomic');
const atomicCalls = [];
stub('write-file-atomic', {
  sync: (...args) => { atomicCalls.push(args); return realWriteAtomic.sync(...args); },
});
stub('../src/logger.js', { info: () => {}, warn: () => {}, error: () => {}, audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: () => {}, emitThrottled: () => {} });

const queue = require('../src/queue.js');
const QF = config.queueFile;

beforeEach(() => {
  try { fs.unlinkSync(QF); } catch (_) {}
  try { fs.rmSync(QF + '.lock', { recursive: true, force: true }); } catch (_) {}
  for (const f of fs.readdirSync(TMP).filter(x => x.includes('.corrupt.'))) {
    try { fs.unlinkSync(path.join(TMP, f)); } catch (_) {}
  }
  atomicCalls.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

const FSYNC_OFF = { fsync: false };

describe('F16/D-3: 4 in-lock queue writes use write-file-atomic with fsync disabled; bootstrap stays plain fs (blacklist.js precedent)', () => {
  it('ensureQueueFile bootstrap write does NOT go through write-file-atomic', async () => {
    expect(fs.existsSync(QF)).toBe(false);
    await queue.peekLength();
    expect(fs.existsSync(QF)).toBe(true);
    expect(fs.readFileSync(QF, 'utf8')).toBe('[]');
    expect(atomicCalls.length).toBe(0);
  });

  it('enqueue writes via write-file-atomic.sync with { fsync: false }', async () => {
    fs.writeFileSync(QF, '[]', 'utf8');
    await queue.enqueue({ source: 'radarr', movieId: 1, traceId: 't1' });
    expect(atomicCalls.length).toBe(1);
    expect(atomicCalls[0][0]).toBe(QF);
    expect(JSON.parse(atomicCalls[0][1])).toEqual([{ source: 'radarr', movieId: 1, traceId: 't1' }]);
    expect(atomicCalls[0][2]).toEqual(FSYNC_OFF);
    expect(JSON.parse(fs.readFileSync(QF, 'utf8'))).toEqual([{ source: 'radarr', movieId: 1, traceId: 't1' }]);
  });

  it('enqueueMany writes via write-file-atomic.sync with { fsync: false }', async () => {
    fs.writeFileSync(QF, '[]', 'utf8');
    await queue.enqueueMany([{ source: 'radarr', movieId: 2, traceId: 't2' }, { source: 'radarr', movieId: 3, traceId: 't3' }]);
    expect(atomicCalls.length).toBe(1);
    expect(atomicCalls[0][0]).toBe(QF);
    expect(atomicCalls[0][2]).toEqual(FSYNC_OFF);
    expect(JSON.parse(fs.readFileSync(QF, 'utf8')).length).toBe(2);
  });

  it('drainQueue resets to [] via write-file-atomic.sync with { fsync: false }', async () => {
    fs.writeFileSync(QF, JSON.stringify([{ source: 'radarr', movieId: 4, traceId: 't4' }]), 'utf8');
    const items = await queue.drainQueue();
    expect(items.length).toBe(1);
    expect(atomicCalls.length).toBe(1);
    expect(atomicCalls[0][0]).toBe(QF);
    expect(atomicCalls[0][1]).toBe('[]');
    expect(atomicCalls[0][2]).toEqual(FSYNC_OFF);
    expect(fs.readFileSync(QF, 'utf8')).toBe('[]');
  });

  it('readQueueSafe quarantine-reset writes [] via write-file-atomic.sync with { fsync: false }', async () => {
    fs.writeFileSync(QF, 'not valid json', 'utf8');
    const data = await queue.getQueue();
    expect(data).toEqual([]);
    expect(atomicCalls.length).toBe(1);
    expect(atomicCalls[0][0]).toBe(QF);
    expect(atomicCalls[0][1]).toBe('[]');
    expect(atomicCalls[0][2]).toEqual(FSYNC_OFF);
    expect(fs.readFileSync(QF, 'utf8')).toBe('[]');
  });
});

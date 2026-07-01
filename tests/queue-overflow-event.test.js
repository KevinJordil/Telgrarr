import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);

const QUEUE_PATH  = require.resolve('../src/queue.js');
const CONFIG_PATH = require.resolve('../src/config.js');
const LOGGER_PATH = require.resolve('../src/logger.js');
const EVENTS_PATH = require.resolve('../src/events.js');
const EVENT_TYPES = require('../shared/events.json');

function stub(absPath, exports) {
  require.cache[absPath] = { id: absPath, filename: absPath, loaded: true, exports };
}

let emitted; let tmpFile; let queue;
function fresh(maxItems) {
  delete require.cache[QUEUE_PATH];
  tmpFile = path.join(os.tmpdir(), 'tg-qov-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  emitted = [];
  stub(CONFIG_PATH, { queueFile: tmpFile, queue: { maxItems } });
  stub(LOGGER_PATH, { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
  stub(EVENTS_PATH, { emit(type, level, module, message, data) { emitted.push({ type, level, module, message, data }); }, bus: { emit() {} } });
  queue = require('../src/queue.js');
}

afterEach(() => { try { fs.unlinkSync(tmpFile); } catch (e) { /* best-effort */ } });

describe('QUEUE_OVERFLOW event (BLR Phase 4, DEC-BLR-17/18)', () => {
  it('single enqueue eviction emits ONE overflow event with droppedCount 1', async () => {
    fresh(3);
    await queue.enqueue({ source: 'test', traceId: 't1' });
    await queue.enqueue({ source: 'test', traceId: 't2' });
    await queue.enqueue({ source: 'test', traceId: 't3' });
    emitted.length = 0;
    const ok = await queue.enqueue({ source: 'test', traceId: 't4' });
    expect(ok).toBe(true);
    const ov = emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_OVERFLOW);
    expect(ov.length).toBe(1);
    expect(ov[0].type).toBe('queue.overflow');
    expect(ov[0].level).toBe('warn');
    expect(ov[0].data.droppedCount).toBe(1);
    expect(ov[0].data.maxItems).toBe(3);
  });

  it('enqueue below cap emits no overflow event', async () => {
    fresh(3);
    await queue.enqueue({ source: 'test', traceId: 't1' });
    expect(emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_OVERFLOW).length).toBe(0);
  });

  it('enqueueMany rolls the whole eviction into ONE event with total droppedCount', async () => {
    fresh(3);
    const added = await queue.enqueueMany([
      { source: 't', traceId: 'a' }, { source: 't', traceId: 'b' },
      { source: 't', traceId: 'c' }, { source: 't', traceId: 'd' },
      { source: 't', traceId: 'e' },
    ]);
    expect(added).toBe(5);
    const ov = emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_OVERFLOW);
    expect(ov.length).toBe(1);
    expect(ov[0].data.droppedCount).toBe(2);
    const persisted = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    expect(persisted.length).toBe(3);
  });

  it('enqueueMany below cap emits no overflow event', async () => {
    fresh(3);
    await queue.enqueueMany([{ source: 't', traceId: 'a' }, { source: 't', traceId: 'b' }]);
    expect(emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_OVERFLOW).length).toBe(0);
  });
});

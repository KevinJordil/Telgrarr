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
  tmpFile = path.join(os.tmpdir(), 'tg-qdw-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  emitted = [];
  stub(CONFIG_PATH, { queueFile: tmpFile, queue: { maxItems } });
  stub(LOGGER_PATH, { info() {}, warn() {}, error() {}, audit() {}, setLevel() {} });
  stub(EVENTS_PATH, { emit(type, level, module, message, data) { emitted.push({ type, level, module, message, data }); }, bus: { emit() {} } });
  queue = require('../src/queue.js');
}
function warns() { return emitted.filter((e) => e.type === EVENT_TYPES.QUEUE_DEPTH_WARNING); }

afterEach(() => { try { fs.unlinkSync(tmpFile); } catch (e) { /* best-effort */ } });

describe('QUEUE_DEPTH_WARNING event (BLR Phase 4, DEC-BLR-13)', () => {
  it('exactly 80% does NOT warn (strict greater-than)', async () => {
    fresh(10);
    for (let i = 0; i < 8; i++) await queue.enqueue({ source: 't', traceId: 'x' + i });
    expect(warns().length).toBe(0);
  });

  it('crossing 80% warns once with depth/max/pct payload', async () => {
    fresh(10);
    for (let i = 0; i < 9; i++) await queue.enqueue({ source: 't', traceId: 'x' + i });
    const w = warns();
    expect(w.length).toBe(1);
    expect(w[0].type).toBe('queue.depth_warning');
    expect(w[0].level).toBe('warn');
    expect(w[0].data.depth).toBe(9);
    expect(w[0].data.maxItems).toBe(10);
    expect(w[0].data.pct).toBe(90);
  });

  it('does not warn twice within the same sweep cycle', async () => {
    fresh(10);
    for (let i = 0; i < 10; i++) await queue.enqueue({ source: 't', traceId: 'x' + i });
    expect(warns().length).toBe(1);
  });

  it('markSweepCycle re-arms the warning for the next cycle', async () => {
    fresh(10);
    for (let i = 0; i < 9; i++) await queue.enqueue({ source: 't', traceId: 'x' + i });
    expect(warns().length).toBe(1);
    queue.markSweepCycle(1);
    await queue.enqueue({ source: 't', traceId: 'x9' });
    expect(warns().length).toBe(2);
  });

  it('enqueueMany crossing the threshold warns once', async () => {
    fresh(10);
    const items = [];
    for (let i = 0; i < 9; i++) items.push({ source: 't', traceId: 'b' + i });
    await queue.enqueueMany(items);
    expect(warns().length).toBe(1);
  });
});

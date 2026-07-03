import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-q-selfheal-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const logCalls = [];
const emitted  = [];
const EVENT_TYPES = require('../shared/events.json');
stub('../src/logger.js', { info: (...a) => logCalls.push(['info', ...a]), warn: (...a) => logCalls.push(['warn', ...a]), error: (...a) => logCalls.push(['error', ...a]), audit: (...a) => logCalls.push(['audit', ...a]), debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: (...a) => emitted.push(a), emitThrottled: (...a) => emitted.push(a) });
const queue = require('../src/queue.js');
const QF = config.queueFile;
const corruptFiles = () => fs.readdirSync(TMP).filter(f => f.includes('.corrupt.'));
beforeEach(() => {
  try { fs.unlinkSync(QF); } catch (_) {}
  try { fs.rmSync(QF + '.lock', { recursive: true, force: true }); } catch (_) {}
  for (const f of corruptFiles()) fs.unlinkSync(path.join(TMP, f));
  fs.writeFileSync(QF, '[]', 'utf8');
  logCalls.length = 0;
  emitted.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('Queue corrupt self-heal (BCS P2 / F2, FLAG B)', () => {
  it('poisoned file: next enqueue quarantines, resets, succeeds, emits QUEUE_CORRUPT_RESET', async () => {
    fs.writeFileSync(QF, '{"broken', 'utf8');
    const ok = await queue.enqueue({ source: 'radarr', movieId: 1, traceId: 't1' });
    expect(ok).toBe(true);
    const disk = JSON.parse(fs.readFileSync(QF, 'utf8'));
    expect(disk.length).toBe(1);
    expect(disk[0].movieId).toBe(1);
    const cf = corruptFiles();
    expect(cf.length).toBe(1);
    expect(fs.readFileSync(path.join(TMP, cf[0]), 'utf8')).toBe('{"broken'); // forensics preserved
    const evt = emitted.find(x => x[0] === EVENT_TYPES.QUEUE_CORRUPT_RESET && x[1] === 'error' && x[2] === 'Queue');
    expect(evt).toBeTruthy();
    expect(EVENT_TYPES.QUEUE_CORRUPT_RESET).toBe('queue.corrupt_reset'); // RD-6 SSoT pin
  });
  it('peekLength on a poisoned file NEVER quarantines (lock-free transient read)', async () => {
    fs.writeFileSync(QF, '{"broken', 'utf8');
    const len = await queue.peekLength();
    expect(len).toBe(0);
    expect(corruptFiles().length).toBe(0);
    expect(fs.readFileSync(QF, 'utf8')).toBe('{"broken'); // untouched
    expect(emitted.find(x => x[0] === EVENT_TYPES.QUEUE_CORRUPT_RESET)).toBeUndefined();
  });
  it('valid-JSON non-array snapshot is quarantined too (declared extension)', async () => {
    fs.writeFileSync(QF, '{}', 'utf8');
    const ok = await queue.enqueue({ source: 'radarr', movieId: 2, traceId: 't2' });
    expect(ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(QF, 'utf8')).length).toBe(1);
    expect(corruptFiles().length).toBe(1);
    expect(emitted.find(x => x[0] === EVENT_TYPES.QUEUE_CORRUPT_RESET)).toBeTruthy();
  });
});

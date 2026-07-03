import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-q-drain-heal-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
config.queueFile = path.join(TMP, 'media_queue.json');
function stub(rel, exports) { const r = require.resolve(rel); require.cache[r] = { id: r, filename: r, loaded: true, exports }; }
const emitted = [];
const EVENT_TYPES = require('../shared/events.json');
stub('../src/logger.js', { info: () => {}, warn: () => {}, error: () => {}, audit: () => {}, debug: () => {}, trace: () => {}, setLevel: () => {} });
stub('../src/events.js', { emit: (...a) => emitted.push(a), emitThrottled: (...a) => emitted.push(a) });
const queue = require('../src/queue.js');
const QF = config.queueFile;
const corruptFiles = () => fs.readdirSync(TMP).filter(f => f.includes('.corrupt.'));
beforeEach(() => {
  try { fs.unlinkSync(QF); } catch (_) {}
  try { fs.rmSync(QF + '.lock', { recursive: true, force: true }); } catch (_) {}
  for (const f of corruptFiles()) fs.unlinkSync(path.join(TMP, f));
  fs.writeFileSync(QF, '[]', 'utf8');
  emitted.length = 0;
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('Queue corrupt drain heals (BCS P2 / F2)', () => {
  it('drainQueue on a poisoned file returns [], quarantines, resets, and ingest resumes', async () => {
    fs.writeFileSync(QF, 'not json at all', 'utf8');
    const items = await queue.drainQueue();
    expect(items).toEqual([]);
    expect(fs.readFileSync(QF, 'utf8')).toBe('[]');
    expect(corruptFiles().length).toBe(1);
    expect(emitted.find(x => x[0] === EVENT_TYPES.QUEUE_CORRUPT_RESET && x[1] === 'error')).toBeTruthy();
    expect(await queue.enqueue({ source: 'radarr', movieId: 9, traceId: 't9' })).toBe(true);
    expect(await queue.peekLength()).toBe(1);
  });
  it('getQueue on a poisoned file returns [] instead of throwing (heals)', async () => {
    fs.writeFileSync(QF, '[1,2,', 'utf8');
    const data = await queue.getQueue();
    expect(data).toEqual([]);
    expect(corruptFiles().length).toBe(1);
    expect(fs.readFileSync(QF, 'utf8')).toBe('[]');
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createLimit } = require('../src/utils/p-limit.js');

describe('p-limit (BLR Phase 3 / C-10: tiny zero-dep bounded-concurrency primitive)', () => {
  it('never runs more than `concurrency` tasks at once', async () => {
    const limit = createLimit(3);
    let active = 0;
    let maxActive = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => limit(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return i;
    }));
    const results = await Promise.all(tasks);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('concurrency=1 fully serializes (no overlap)', async () => {
    const limit = createLimit(1);
    let active = 0;
    let overlapDetected = false;
    const tasks = Array.from({ length: 5 }, () => limit(async () => {
      active++;
      if (active > 1) overlapDetected = true;
      await new Promise((r) => setTimeout(r, 5));
      active--;
    }));
    await Promise.all(tasks);
    expect(overlapDetected).toBe(false);
  });

  it('a rejected task does not block or crash sibling tasks', async () => {
    const limit = createLimit(2);
    const p1 = limit(async () => { throw new Error('boom'); });
    const p2 = limit(async () => 42);
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe(42);
  });

  it('all queued tasks eventually run and resolve once slots free up', async () => {
    const limit = createLimit(2);
    let completed = 0;
    const tasks = Array.from({ length: 8 }, () => limit(async () => {
      await new Promise((r) => setTimeout(r, 5));
      completed++;
    }));
    await Promise.all(tasks);
    expect(completed).toBe(8);
  });

  it('throws synchronously on invalid concurrency', () => {
    expect(() => createLimit(0)).toThrow();
    expect(() => createLimit(-1)).toThrow();
    expect(() => createLimit(1.5)).toThrow();
    expect(() => createLimit('5')).toThrow();
  });
});

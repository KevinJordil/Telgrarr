import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

let tmpDir;

const logStub = {
  info: () => {}, warn: () => {}, error: () => {},
  audit: () => {}, debug: () => {}, setLevel: () => {},
};

function freshHistory(maxItems = 500) {
  delete require.cache[require.resolve('../src/history.js')];
  try { fs.unlinkSync(path.join(tmpDir, 'history.json')); } catch (_) {}
  [
    ['../src/logger.js', logStub],
    ['../src/config.js', { DATA_DIR: tmpDir, history: { maxItems, maxAgeDays: 0 } }],
    ['proper-lockfile',  { lock: async () => async () => {} }],
  ].forEach(([mod, exp]) => {
    const id = require.resolve(mod);
    require.cache[id] = { id, filename: id, loaded: true, exports: exp };
  });
  return require('../src/history.js');
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-ret-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Cap enforcement ───────────────────────────────────────────────────────────
describe('cap enforcement', () => {
  it('trims to maxItems when limit is exceeded', async () => {
    const h = freshHistory(3);
    await h.addHistory(
      Array.from({ length: 5 }, (_, i) => ({
        id: `cap-${i}`, type: 'movie', title: `Film ${i}`, timestamp: new Date().toISOString(),
      }))
    );
    expect(h.getHistory()).toHaveLength(3);
  });

  it('keeps the newest entries when trimming (prepend semantics)', async () => {
    const h = freshHistory(2);
    await h.addHistory([{ id: 'oldest', type: 'movie', title: 'Oldest', timestamp: daysAgo(10) }]);
    await h.addHistory([{ id: 'middle', type: 'movie', title: 'Middle', timestamp: daysAgo(5)  }]);
    await h.addHistory([{ id: 'newest', type: 'movie', title: 'Newest', timestamp: daysAgo(1)  }]);
    const ids = h.getHistory().map(e => e.id);
    expect(ids).toContain('newest');
    expect(ids).toContain('middle');
    expect(ids).not.toContain('oldest');
  });

  it('does not trim when count equals maxItems exactly', async () => {
    const h = freshHistory(5);
    await h.addHistory(
      Array.from({ length: 5 }, (_, i) => ({
        id: `ex-${i}`, type: 'movie', title: `Film ${i}`, timestamp: new Date().toISOString(),
      }))
    );
    expect(h.getHistory()).toHaveLength(5);
  });

  it('trims to cap after adding one beyond the limit', async () => {
    const h = freshHistory(5);
    await h.addHistory(
      Array.from({ length: 5 }, (_, i) => ({
        id: `pre-${i}`, type: 'movie', title: `Film ${i}`, timestamp: new Date().toISOString(),
      }))
    );
    await h.addHistory([{ id: 'extra', type: 'movie', title: 'Extra', timestamp: new Date().toISOString() }]);
    expect(h.getHistory()).toHaveLength(5);
    expect(h.getHistory()[0].id).toBe('extra');
  });

  it('persists the trimmed array to disk', async () => {
    const h = freshHistory(2);
    await h.addHistory(
      Array.from({ length: 4 }, (_, i) => ({
        id: `disk-${i}`, type: 'movie', title: `Film ${i}`, timestamp: new Date().toISOString(),
      }))
    );
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved).toHaveLength(2);
  });
});

// ── Age pruning ───────────────────────────────────────────────────────────────
describe('pruneByAge', () => {
  it('0 is a strict no-op (unlimited retention)', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'noop', type: 'movie', title: 'Old', timestamp: daysAgo(365) }]);
    expect(await h.pruneByAge(0)).toBe(0);
    expect(h.getHistory()).toHaveLength(1);
  });

  it('negative value is a strict no-op', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'neg', type: 'movie', title: 'Old', timestamp: daysAgo(365) }]);
    expect(await h.pruneByAge(-5)).toBe(0);
    expect(h.getHistory()).toHaveLength(1);
  });

  it('removes entries older than the threshold', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'old', type: 'movie', title: 'Old', timestamp: daysAgo(40) },
      { id: 'new', type: 'movie', title: 'New', timestamp: daysAgo(5)  },
    ]);
    expect(await h.pruneByAge(30)).toBe(1);
    expect(h.getById('old')).toBeNull();
    expect(h.getById('new')).not.toBeNull();
  });

  it('keeps entries within the threshold', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'within', type: 'movie', title: 'Recent', timestamp: daysAgo(29) }]);
    expect(await h.pruneByAge(30)).toBe(0);
    expect(h.getById('within')).not.toBeNull();
  });

  it('returns 0 when no entries qualify for pruning', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'fresh', type: 'movie', title: 'Fresh', timestamp: daysAgo(1) }]);
    expect(await h.pruneByAge(30)).toBe(0);
  });

  it('prunes all entries when all are beyond the threshold', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'v1', type: 'movie', title: 'A', timestamp: daysAgo(100) },
      { id: 'v2', type: 'movie', title: 'B', timestamp: daysAgo(200) },
    ]);
    expect(await h.pruneByAge(30)).toBe(2);
    expect(h.getHistory()).toHaveLength(0);
  });

  it('persists the pruned state to disk', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'old-d', type: 'movie', title: 'Old', timestamp: daysAgo(100) },
      { id: 'new-d', type: 'movie', title: 'New', timestamp: daysAgo(1)   },
    ]);
    await h.pruneByAge(30);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('new-d');
  });

  it('keeps entries with no timestamp (malformed-entry guard)', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'no-ts', type: 'movie', title: 'No Timestamp' }]);
    expect(await h.pruneByAge(30)).toBe(0);
    expect(h.getById('no-ts')).not.toBeNull();
  });
});

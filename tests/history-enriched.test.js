import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);

let tmpDir;

// Logger exports the log object directly at module root (+ setLevel property).
const logStub = {
  info: () => {}, warn: () => {}, error: () => {},
  audit: () => {}, debug: () => {}, setLevel: () => {},
};

/**
 * Returns a fresh history singleton backed by a real temp file.
 * proper-lockfile is stubbed (no .lock dirs); write-file-atomic is real (so
 * disk-state assertions work without extra stubs).
 */
function freshHistory(maxItems = 500, initial = null) {
  delete require.cache[require.resolve('../src/history.js')];

  if (initial !== null) {
    fs.writeFileSync(
      path.join(tmpDir, 'history.json'),
      JSON.stringify(initial, null, 2)
    );
  } else {
    try { fs.unlinkSync(path.join(tmpDir, 'history.json')); } catch (_) {}
  }

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

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-enr-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── R09 atomic-write compliance ───────────────────────────────────────────────
describe('R09 compliance', () => {
  it('does not use fs.writeFileSync for mutations', () => {
    const src = fs.readFileSync(require.resolve('../src/history.js'), 'utf8');
    expect(src).not.toContain('fs.writeFileSync');
    expect(src).toContain('write-file-atomic');
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
describe('boot', () => {
  it('creates history.json when absent', () => {
    freshHistory();
    const p = path.join(tmpDir, 'history.json');
    expect(fs.existsSync(p)).toBe(true);
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual([]);
  });

  it('loads existing entries on boot', () => {
    const entry = { id: 'boot-1', type: 'movie', title: 'Test', timestamp: new Date().toISOString() };
    const h = freshHistory(500, [entry]);
    expect(h.getHistory()).toHaveLength(1);
    expect(h.getHistory()[0].id).toBe('boot-1');
  });
});

// ── Migration-on-read ─────────────────────────────────────────────────────────
describe('migration-on-read', () => {
  it('assigns unique ids to legacy entries that lack one', () => {
    const legacy = [
      { type: 'movie', title: 'Old Movie', timestamp: new Date().toISOString() },
      { type: 'show',  title: 'Old Show',  timestamp: new Date().toISOString() },
    ];
    const h = freshHistory(500, legacy);
    const all = h.getHistory();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBeTruthy();
    expect(all[1].id).toBeTruthy();
    expect(all[0].id).not.toEqual(all[1].id);
  });

  it('preserves existing ids and all other fields', () => {
    const existing = [{ id: 'keep-me', type: 'movie', title: 'Film', timestamp: new Date().toISOString() }];
    const h = freshHistory(500, existing);
    expect(h.getHistory()[0].id).toBe('keep-me');
    expect(h.getHistory()[0].title).toBe('Film');
  });

  it('persists migrated ids to disk', () => {
    const legacy = [{ type: 'movie', title: 'Film', timestamp: new Date().toISOString() }];
    freshHistory(500, legacy);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved[0].id).toBeTruthy();
  });
});

// ── addHistory ────────────────────────────────────────────────────────────────
describe('addHistory', () => {
  it('prepends new items (newest at index 0)', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'first',  type: 'movie', title: 'A', timestamp: new Date().toISOString() }]);
    await h.addHistory([{ id: 'second', type: 'movie', title: 'B', timestamp: new Date().toISOString() }]);
    expect(h.getHistory()[0].id).toBe('second');
    expect(h.getHistory()[1].id).toBe('first');
  });

  it('is a no-op on empty array', async () => {
    const h = freshHistory();
    await h.addHistory([]);
    expect(h.getHistory()).toHaveLength(0);
  });

  it('is a no-op on null', async () => {
    const h = freshHistory();
    await h.addHistory(null);
    expect(h.getHistory()).toHaveLength(0);
  });

  it('persists to disk atomically after add', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'p-1', type: 'movie', title: 'Saved', timestamp: new Date().toISOString() }]);
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('p-1');
  });

  it('stores all enriched dispatch snapshot fields', async () => {
    const h = freshHistory();
    const rich = {
      id: 'rich-1', type: 'movie', title: 'The Matrix', year: 1999,
      poster: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/def.jpg',
      timestamp: new Date().toISOString(), traces: ['trace-abc'], details: '136 min',
      ratings: { imdb: '8.7', tmdb: '8.2', rottenTomatoes: '83', metacritic: '73' },
      imdbId: 'tt0133093', tmdbId: 603, language: 'ar',
      overview: 'Thomas Anderson discovers the truth about reality.',
      genres: 'Action, Sci-Fi', runtime: 136, quality: 'Bluray-1080p',
      episodes: null,
      externalIds: { tmdbId: 603, imdbId: 'tt0133093', tvdbId: null },
    };
    await h.addHistory([rich]);
    const stored = h.getById('rich-1');
    expect(stored).not.toBeNull();
    expect(stored.ratings.imdb).toBe('8.7');
    expect(stored.ratings.rottenTomatoes).toBe('83');
    expect(stored.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/def.jpg');
    expect(stored.quality).toBe('Bluray-1080p');
    expect(stored.runtime).toBe(136);
    expect(stored.overview).toBeTruthy();
    expect(stored.genres).toBe('Action, Sci-Fi');
    expect(stored.externalIds.imdbId).toBe('tt0133093');
  });
});

// ── getById ───────────────────────────────────────────────────────────────────
describe('getById', () => {
  it('returns the matching entry', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'find-me', type: 'show', title: 'Show', timestamp: new Date().toISOString() }]);
    const e = h.getById('find-me');
    expect(e).not.toBeNull();
    expect(e.title).toBe('Show');
  });

  it('returns null for an unknown id', () => {
    expect(freshHistory().getById('ghost')).toBeNull();
  });
});

// ── removeById ────────────────────────────────────────────────────────────────
describe('removeById', () => {
  it('removes a known entry and returns true', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'rm-1', type: 'movie', title: 'Y', timestamp: new Date().toISOString() }]);
    expect(await h.removeById('rm-1')).toBe(true);
    expect(h.getById('rm-1')).toBeNull();
  });

  it('returns false for a non-existent id', async () => {
    expect(await freshHistory().removeById('ghost')).toBe(false);
  });

  it('persists removal to disk', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'rm-d', type: 'movie', title: 'Z', timestamp: new Date().toISOString() }]);
    await h.removeById('rm-d');
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved.find(e => e.id === 'rm-d')).toBeUndefined();
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────
describe('clear', () => {
  it('empties the store and returns the removed count', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'cl-1', type: 'movie', title: 'A', timestamp: new Date().toISOString() },
      { id: 'cl-2', type: 'show',  title: 'B', timestamp: new Date().toISOString() },
    ]);
    expect(await h.clear()).toBe(2);
    expect(h.getHistory()).toHaveLength(0);
  });

  it('returns 0 when already empty', async () => {
    expect(await freshHistory().clear()).toBe(0);
  });

  it('persists empty state to disk', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'cl-p', type: 'movie', title: 'X', timestamp: new Date().toISOString() }]);
    await h.clear();
    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf8'));
    expect(saved).toHaveLength(0);
  });
});

// ── stats ─────────────────────────────────────────────────────────────────────
describe('stats', () => {
  it('returns correct totals and byType breakdown', async () => {
    const h = freshHistory();
    const now = new Date().toISOString();
    await h.addHistory([
      { id: 'st-1', type: 'movie', title: 'Film 1', timestamp: now },
      { id: 'st-2', type: 'movie', title: 'Film 2', timestamp: now },
      { id: 'st-3', type: 'show',  title: 'Show 1', timestamp: now },
    ]);
    const s = h.stats();
    expect(s.total).toBe(3);
    expect(s.byType.movie).toBe(2);
    expect(s.byType.show).toBe(1);
  });

  it('identifies oldest and newest timestamps correctly', async () => {
    const h = freshHistory();
    const old    = '2024-01-01T00:00:00.000Z';
    const recent = '2025-06-01T00:00:00.000Z';
    await h.addHistory([
      { id: 'ts-1', type: 'movie', title: 'A', timestamp: recent },
      { id: 'ts-2', type: 'movie', title: 'B', timestamp: old },
    ]);
    const s = h.stats();
    expect(s.oldest).toBe(old);
    expect(s.newest).toBe(recent);
  });

  it('returns zero counts and null timestamps for an empty store', () => {
    const s = freshHistory().stats();
    expect(s.total).toBe(0);
    expect(s.byType.show).toBe(0);
    expect(s.byType.movie).toBe(0);
    expect(s.oldest).toBeNull();
    expect(s.newest).toBeNull();
  });
});

// ── getAll — filtering, sorting, pagination ───────────────────────────────────
describe('getAll', () => {
  it('returns all entries with default params', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'all-1', type: 'movie', title: 'Film', timestamp: '2025-01-01T00:00:00.000Z' },
      { id: 'all-2', type: 'show',  title: 'Show', timestamp: '2025-02-01T00:00:00.000Z' },
    ]);
    const res = h.getAll();
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(2);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(24);
  });

  it('filters by type=movie', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'fm-1', type: 'movie', title: 'Film', timestamp: new Date().toISOString() },
      { id: 'fm-2', type: 'show',  title: 'Show', timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ type: 'movie' });
    expect(res.total).toBe(1);
    expect(res.items[0].type).toBe('movie');
  });

  it('filters by type=show', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'fs-1', type: 'movie', title: 'Film', timestamp: new Date().toISOString() },
      { id: 'fs-2', type: 'show',  title: 'Show', timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ type: 'show' });
    expect(res.total).toBe(1);
    expect(res.items[0].type).toBe('show');
  });

  it('filters by search (case-insensitive substring)', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'srch-1', type: 'movie', title: 'The Dark Knight', timestamp: new Date().toISOString() },
      { id: 'srch-2', type: 'movie', title: 'Batman Begins',   timestamp: new Date().toISOString() },
      { id: 'srch-3', type: 'show',  title: 'Gotham',          timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ search: 'batman' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('srch-2');
  });

  it('sorts newest first', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'sn-1', type: 'movie', title: 'Old', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'sn-2', type: 'movie', title: 'New', timestamp: '2025-06-01T00:00:00.000Z' },
    ]);
    const res = h.getAll({ sort: 'newest' });
    expect(res.items[0].id).toBe('sn-2');
    expect(res.items[1].id).toBe('sn-1');
  });

  it('sorts oldest first', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'so-1', type: 'movie', title: 'Old', timestamp: '2024-01-01T00:00:00.000Z' },
      { id: 'so-2', type: 'movie', title: 'New', timestamp: '2025-06-01T00:00:00.000Z' },
    ]);
    const res = h.getAll({ sort: 'oldest' });
    expect(res.items[0].id).toBe('so-1');
    expect(res.items[1].id).toBe('so-2');
  });

  it('sorts title-asc', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'ta-1', type: 'movie', title: 'Zulu',  timestamp: new Date().toISOString() },
      { id: 'ta-2', type: 'movie', title: 'Alien', timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ sort: 'title-asc' });
    expect(res.items[0].title).toBe('Alien');
    expect(res.items[1].title).toBe('Zulu');
  });

  it('sorts title-desc', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'td-1', type: 'movie', title: 'Zulu',  timestamp: new Date().toISOString() },
      { id: 'td-2', type: 'movie', title: 'Alien', timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ sort: 'title-desc' });
    expect(res.items[0].title).toBe('Zulu');
    expect(res.items[1].title).toBe('Alien');
  });

  it('paginates: correct slices across pages', async () => {
    const h = freshHistory();
    await h.addHistory(
      Array.from({ length: 10 }, (_, i) => ({
        id: `pg-${i}`, type: 'movie', title: `Film ${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
      }))
    );
    const p1 = h.getAll({ page: 1, pageSize: 3 });
    const p2 = h.getAll({ page: 2, pageSize: 3 });
    expect(p1.total).toBe(10);
    expect(p1.items).toHaveLength(3);
    expect(p2.items).toHaveLength(3);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
  });

  it('paginates: last page contains remaining items', async () => {
    const h = freshHistory();
    await h.addHistory(
      Array.from({ length: 10 }, (_, i) => ({
        id: `lp-${i}`, type: 'movie', title: `Film ${i}`,
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
      }))
    );
    // 10 items, pageSize 3 → 4 pages; page 4 has 1 item
    expect(h.getAll({ page: 4, pageSize: 3 }).items).toHaveLength(1);
  });

  it('combines type filter and search', async () => {
    const h = freshHistory();
    await h.addHistory([
      { id: 'cb-1', type: 'movie', title: 'Alien Movie', timestamp: new Date().toISOString() },
      { id: 'cb-2', type: 'show',  title: 'Alien Show',  timestamp: new Date().toISOString() },
    ]);
    const res = h.getAll({ type: 'movie', search: 'alien' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('cb-1');
  });
});

// ── backward compatibility ────────────────────────────────────────────────────
describe('backward compatibility', () => {
  it('getHistory returns an array', () => {
    expect(Array.isArray(freshHistory().getHistory())).toBe(true);
  });

  it('getHistory reflects mutations', async () => {
    const h = freshHistory();
    await h.addHistory([{ id: 'bc-1', type: 'movie', title: 'X', timestamp: new Date().toISOString() }]);
    expect(h.getHistory()).toHaveLength(1);
    await h.clear();
    expect(h.getHistory()).toHaveLength(0);
  });
});

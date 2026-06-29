import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const supertest = require('supertest');

// DI: inject into require.cache BEFORE requiring the SUT.
function stub(p, exp) {
  const id = require.resolve(p);
  require.cache[id] = { id, filename: id, loaded: true, exports: exp };
}

let authMiddleware;
let mockHistory;
const auditCalls = [];
const errorCalls = [];

function makeApp() {
  // Fresh route module per test — clears singleton state.
  delete require.cache[require.resolve('../src/routes/history.routes.js')];
  stub('../src/history.js',          mockHistory);
  stub('../src/middlewares/auth.js',  { requireAuth: (req, res, next) => authMiddleware(req, res, next) });
  stub('../src/logger.js',            {
    error: (...a) => errorCalls.push(a),
    audit: (...a) => auditCalls.push(a),
    info:  () => {},
    warn:  () => {},
  });
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api', require('../src/routes/history.routes.js'));
  return app;
}

beforeEach(() => {
  authMiddleware = (req, res, next) => next();
  auditCalls.length = 0;
  errorCalls.length = 0;
  mockHistory = {
    getAll: (o) => ({
      items:    [{ id: 'e1', title: 'The Matrix', type: 'movie' }],
      total:    1,
      page:     o.page     ?? 1,
      pageSize: o.pageSize ?? 24,
    }),
    stats:      ()    => ({ total: 5, byType: { show: 2, movie: 3 }, oldest: '2025-01-01T00:00:00.000Z', newest: '2026-06-01T00:00:00.000Z' }),
    getById:    (id)  => id === 'known-id' ? { id: 'known-id', title: 'The Matrix', type: 'movie', timestamp: '2026-06-01T00:00:00.000Z' } : null,
    removeById: async (id)  => id === 'known-id',
    clear:      async ()    => 7,
  };
});

// -- GET /api/history ---------------------------------------------------------
describe('GET /api/history', () => {
  it('returns 200 with paginated result on bare request', async () => {
    const res = await supertest(makeApp()).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: expect.any(Array), total: 1, page: 1, pageSize: 24 });
  });

  it('accepts type=show', async () => {
    expect((await supertest(makeApp()).get('/api/history?type=show')).status).toBe(200);
  });

  it('accepts type=movie', async () => {
    expect((await supertest(makeApp()).get('/api/history?type=movie')).status).toBe(200);
  });

  it('rejects unknown type with 400', async () => {
    const res = await supertest(makeApp()).get('/api/history?type=sonarr');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/i);
  });

  it('accepts all four valid sort values', async () => {
    for (const s of ['newest', 'oldest', 'title-asc', 'title-desc']) {
      expect((await supertest(makeApp()).get('/api/history?sort=' + s)).status).toBe(200);
    }
  });

  it('rejects unknown sort with 400', async () => {
    const res = await supertest(makeApp()).get('/api/history?sort=random');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sort/i);
  });

  it('forwards page and pageSize to getAll', async () => {
    let captured;
    mockHistory.getAll = (o) => { captured = o; return { items: [], total: 0, page: o.page, pageSize: o.pageSize }; };
    await supertest(makeApp()).get('/api/history?page=3&pageSize=10');
    expect(captured.page).toBe(3);
    expect(captured.pageSize).toBe(10);
  });

  it('rejects fractional page with 400', async () => {
    const res = await supertest(makeApp()).get('/api/history?page=1.5');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/page/i);
  });

  it('rejects page=0 with 400', async () => {
    expect((await supertest(makeApp()).get('/api/history?page=0')).status).toBe(400);
  });

  it('rejects non-numeric page with 400', async () => {
    expect((await supertest(makeApp()).get('/api/history?page=abc')).status).toBe(400);
  });

  it('rejects pageSize=0 with 400', async () => {
    expect((await supertest(makeApp()).get('/api/history?pageSize=0')).status).toBe(400);
  });

  it('rejects pageSize=101 with 400', async () => {
    const res = await supertest(makeApp()).get('/api/history?pageSize=101');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pageSize/i);
  });

  it('caps search at 200 chars', async () => {
    let captured;
    mockHistory.getAll = (o) => { captured = o; return { items: [], total: 0, page: 1, pageSize: 24 }; };
    await supertest(makeApp()).get('/api/history?search=' + 'x'.repeat(300));
    expect(captured.search).toBeDefined();
    expect(captured.search.length).toBeLessThanOrEqual(200);
  });

  it('treats empty search string as no-filter (undefined)', async () => {
    let captured;
    mockHistory.getAll = (o) => { captured = o; return { items: [], total: 0, page: 1, pageSize: 24 }; };
    await supertest(makeApp()).get('/api/history?search=');
    expect(captured.search).toBeUndefined();
  });

  it('returns 401 without auth', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    expect((await supertest(makeApp()).get('/api/history')).status).toBe(401);
  });

  it('returns 500 and logs error on getAll throw', async () => {
    mockHistory.getAll = () => { throw new Error('disk fail'); };
    const res = await supertest(makeApp()).get('/api/history');
    expect(res.status).toBe(500);
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(errorCalls[0][0]).toBe('History');
  });
});

// -- GET /api/history/stats ---------------------------------------------------
describe('GET /api/history/stats', () => {
  it('returns 200 with stats object', async () => {
    const res = await supertest(makeApp()).get('/api/history/stats');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 5, byType: { show: 2, movie: 3 } });
  });

  it('literal /stats route wins over /:id (registration order guard)', async () => {
    // If /stats were registered AFTER /:id, getById would be called with id='stats'.
    let getByIdCalled = false;
    mockHistory.getById = () => { getByIdCalled = true; return null; };
    const res = await supertest(makeApp()).get('/api/history/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('byType');
    expect(getByIdCalled).toBe(false);
  });

  it('returns 401 without auth', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    expect((await supertest(makeApp()).get('/api/history/stats')).status).toBe(401);
  });

  it('returns 500 and logs error on stats throw', async () => {
    mockHistory.stats = () => { throw new Error('disk fail'); };
    const res = await supertest(makeApp()).get('/api/history/stats');
    expect(res.status).toBe(500);
    expect(errorCalls.length).toBeGreaterThan(0);
  });
});

// -- GET /api/history/:id -----------------------------------------------------
describe('GET /api/history/:id', () => {
  it('returns 200 with entry when found', async () => {
    const res = await supertest(makeApp()).get('/api/history/known-id');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('known-id');
    expect(res.body.title).toBe('The Matrix');
  });

  it('returns 404 when entry not found', async () => {
    const res = await supertest(makeApp()).get('/api/history/missing-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 401 without auth', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    expect((await supertest(makeApp()).get('/api/history/known-id')).status).toBe(401);
  });

  it('returns 500 and logs error on getById throw', async () => {
    mockHistory.getById = () => { throw new Error('disk fail'); };
    const res = await supertest(makeApp()).get('/api/history/known-id');
    expect(res.status).toBe(500);
    expect(errorCalls.length).toBeGreaterThan(0);
  });
});

// -- DELETE /api/history/:id --------------------------------------------------
describe('DELETE /api/history/:id', () => {
  it('returns 200 with success:true and emits audit log', async () => {
    const res = await supertest(makeApp()).delete('/api/history/known-id');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0][0]).toBe('History');
    expect(auditCalls[0][1]).toMatch(/known-id/);
  });

  it('returns 404 when entry not found and emits no audit', async () => {
    const res = await supertest(makeApp()).delete('/api/history/missing-id');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
    expect(auditCalls.length).toBe(0);
  });

  it('returns 401 without auth', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    expect((await supertest(makeApp()).delete('/api/history/known-id')).status).toBe(401);
  });

  it('returns 500 and no audit on removeById throw', async () => {
    mockHistory.removeById = async () => { throw new Error('disk fail'); };
    const res = await supertest(makeApp()).delete('/api/history/known-id');
    expect(res.status).toBe(500);
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(auditCalls.length).toBe(0);
  });
});

// -- DELETE /api/history (clear-all) ------------------------------------------
describe('DELETE /api/history (clear-all)', () => {
  it('returns 200 with success and removed count, emits audit', async () => {
    const res = await supertest(makeApp())
      .delete('/api/history')
      .send({ confirm: 'CLEAR_HISTORY' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.removed).toBe(7);
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0][0]).toBe('History');
    expect(auditCalls[0][1]).toMatch(/7/);
  });

  it('returns 400 with no body', async () => {
    const res = await supertest(makeApp()).delete('/api/history');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirm/i);
  });

  it('returns 400 with wrong confirm string', async () => {
    expect((await supertest(makeApp()).delete('/api/history').send({ confirm: 'yes' })).status).toBe(400);
  });

  it('returns 400 with empty body object', async () => {
    expect((await supertest(makeApp()).delete('/api/history').send({})).status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    authMiddleware = (req, res) => res.status(401).json({ error: 'Unauthorized' });
    expect((await supertest(makeApp()).delete('/api/history').send({ confirm: 'CLEAR_HISTORY' })).status).toBe(401);
  });

  it('returns 500 and no audit on clear throw', async () => {
    mockHistory.clear = async () => { throw new Error('disk fail'); };
    const res = await supertest(makeApp())
      .delete('/api/history')
      .send({ confirm: 'CLEAR_HISTORY' });
    expect(res.status).toBe(500);
    expect(errorCalls.length).toBeGreaterThan(0);
    expect(auditCalls.length).toBe(0);
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// FA-46 / F11.5b: proves POST /api/queue/flush's fire-and-forget runSweep()
// now carries a .catch (mirrors the established sweeper.js:87 idiom) instead
// of leaking an unhandled rejection past FA-10's index.js handler. No prior
// suite covers queue.routes.js (grep-confirmed empty this session) -- new
// file, DI-stubbed per the established require.cache convention (Master
// VITEST HARNESS). Scope is deliberately limited to /queue/flush (the
// endpoint FA-46 names) plus its pre-existing parity; /queue/clear and
// /queue/status are untouched by this fix and are out of scope here.
function stub(p, exports) {
  const id = require.resolve(p);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const mockLogError = vi.fn();
const mockLogAudit = vi.fn();
const mockEventsEmit = vi.fn();
const mockGetQueueState = vi.fn();
const mockRunSweep = vi.fn();
const mockDrainQueue = vi.fn();

stub('../src/logger.js', { error: mockLogError, audit: mockLogAudit });
stub('../src/events.js', { emit: mockEventsEmit });
stub('../src/middlewares/auth.js', { requireAuth: (req, res, next) => next() });
stub('../src/queue.js', { drainQueue: mockDrainQueue });
stub('../src/sweeper.js', { getQueueState: mockGetQueueState, runSweep: mockRunSweep });

const express = require('express');
const queueRouter = require('../src/routes/queue.routes.js');

const app = express();
app.use(express.json());
app.use('/api', queueRouter);

let server, base;

beforeAll(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetQueueState.mockReturnValue({ active: true, expiresAt: null, isSweeping: false });
  mockRunSweep.mockResolvedValue(undefined);
  mockDrainQueue.mockResolvedValue([]);
});

// The route's runSweep() is fired via setImmediate AFTER res.json() -- give
// the event loop a turn beyond the fetch round-trip before asserting on the
// fire-and-forget path.
async function settle() {
  await new Promise((r) => setTimeout(r, 50));
}

describe('POST /api/queue/flush (FA-46)', () => {
  it('[parity] 409s and never triggers a sweep while one is in progress', async () => {
    mockGetQueueState.mockReturnValue({ active: true, expiresAt: null, isSweeping: true });
    const r = await fetch(`${base}/api/queue/flush`, { method: 'POST' });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: 'Sweep currently in progress. Please wait.' });
    await settle();
    expect(mockRunSweep).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('[parity] 400s and never triggers a sweep when the queue is inactive', async () => {
    mockGetQueueState.mockReturnValue({ active: false, expiresAt: null, isSweeping: false });
    const r = await fetch(`${base}/api/queue/flush`, { method: 'POST' });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'No active queue to flush.' });
    await settle();
    expect(mockRunSweep).not.toHaveBeenCalled();
  });

  it('[parity] 200s, audits, emits, and fires the sweep on success', async () => {
    const r = await fetch(`${base}/api/queue/flush`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    expect(mockLogAudit).toHaveBeenCalledWith('Queue', 'Manual flush triggered via GUI.');
    expect(mockEventsEmit).toHaveBeenCalledWith(
      expect.anything(), 'info', 'Queue', 'Queue flushed manually', {}
    );
    await settle();
    expect(mockRunSweep).toHaveBeenCalledTimes(1);
  });

  it('FA-46: a rejected fire-and-forget runSweep is caught and logged under the Sweeper noun, response unaffected', async () => {
    mockRunSweep.mockRejectedValue(new Error('boom'));
    const r = await fetch(`${base}/api/queue/flush`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true });
    await settle();
    expect(mockRunSweep).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    const [noun, message] = mockLogError.mock.calls[0];
    expect(noun).toBe('Sweeper');
    expect(message).toContain('Sweep Manual Flush');
    expect(message).toContain('boom');
  });

  it('[parity] a successful fire-and-forget sweep never logs an error', async () => {
    const r = await fetch(`${base}/api/queue/flush`, { method: 'POST' });
    expect(r.status).toBe(200);
    await settle();
    expect(mockLogError).not.toHaveBeenCalled();
  });
});

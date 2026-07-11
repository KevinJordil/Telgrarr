import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-live-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
function stub(p, exports) {
  const id = require.resolve(p);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('../src/queue.js', {
  peekLength: async () => 0,
  drainQueue: async () => [], enqueue: async () => true, enqueueMany: async () => 0,
  getQueue: async () => [], identityKey: () => null, markSweepCycle: () => {},
});
stub('../src/sweeper.js', {
  getSweepStats: () => ({ active: false, startedAt: null, durationMs: null, lastCompletedAt: null }),
  scheduleSweep: async () => {},
  getQueueState: () => ({ active: false, expiresAt: null, isSweeping: false }),
  runSweep: async () => {},
  recoverCrashedSweep: async () => false,
});
stub('../src/services/provider-breaker.js', {
  getTrippedReason: () => null,
  isTmdbAuthError: () => false, isOmdbAuthError: () => false,
  isTmdbRateLimitError: () => false, isOmdbRateLimitError: () => false,
  isOmdbQuotaExhausted: () => false,
  trip: () => {}, tripRate: () => {}, tripQuota: () => {},
  isTripped: () => false, reset: () => {}, resetCycle: () => {},
});
stub('../src/translator-cooldown.js', {
  getCooldownUntil: () => null,
  isCoolingDown: () => false, noteRateLimit: () => {}, noteQuotaExhausted: () => {},
  clear: () => {}, resetCycle: () => {},
  MIN_COOLDOWN_MS: 5000, DEFAULT_COOLDOWN_MS: 60000, MAX_COOLDOWN_MS: 300000,
});
const { app } = require('../src/listener.js');
let server, base;
beforeAll(async () => {
  // ND-5 precedent: ephemeral port on loopback -- never the app port.
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});
describe('/health/live liveness probe (OSR-3 BUG #4)', () => {
  it('returns 200 {status:"alive"} while the app is UNCONFIGURED (no config checks)', async () => {
    const r = await fetch(`${base}/health/live`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ status: 'alive' });
    expect(Object.keys(body)).toEqual(['status']);
  });
  it('PARITY LOCK: deep /health STILL returns 503 + config check failed while unconfigured (S3/G.1 unchanged)', async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(503);
    const body = await r.json();
    expect(body.status).toBe('degraded');
    expect(body.checks.config.ok).toBe(false);
    expect(Array.isArray(body.checks.config.missing)).toBe(true);
    expect(body.checks.config.missing.length).toBeGreaterThan(0);
  });
  it('liveness is not swallowed by the SPA fallback (json, not html)', async () => {
    const r = await fetch(`${base}/health/live`);
    expect((r.headers.get('content-type') || '')).toContain('application/json');
  });
});

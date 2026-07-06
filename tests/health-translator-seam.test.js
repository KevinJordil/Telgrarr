import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-44 / F7: proves the REAL /health <-> translator-cooldown wiring.
// health-observability.test.js stubs translator-cooldown.js entirely, so a
// key-format mismatch between listener.js's lookup and translator.js's
// real write-side keys ('tier1'/'tier2'/'tier3') is invisible to it. This
// file leaves translator-cooldown.js REAL and stubs only its three
// unrelated /health data sources (queue, sweeper, provider-breaker).

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-f7-seam-'));
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

// REAL module -- NOT stubbed. The same singleton listener.js's
// require('./translator-cooldown') resolves to.
const realCooldown = require('../src/translator-cooldown.js');
const { app } = require('../src/listener.js');

let server, base;
beforeAll(async () => {
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  realCooldown.clear();
});
afterAll(async () => {
  realCooldown.clear();
  await new Promise((r) => server.close(r));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

async function getHealth() {
  const r = await fetch(`${base}/health`);
  return { http: r.status, body: await r.json() };
}

describe('/health <-> translator-cooldown real wiring (FA-44 / F7)', () => {
  it('reports idle when no real cooldown has been noted', async () => {
    const { body } = await getHealth();
    expect(body.observability.translator.tiers).toEqual({
      1: { coolingDown: false, untilMs: null },
      2: { coolingDown: false, untilMs: null },
      3: { coolingDown: false, untilMs: null },
    });
  });

  it('reflects a real tier2 rate-limit cooldown under the numeric response key (the FA-44 regression)', async () => {
    const t0 = Date.now();
    realCooldown.noteRateLimit('tier2');
    const { body } = await getHealth();
    const tiers = body.observability.translator.tiers;
    expect(tiers['2'].coolingDown).toBe(true);
    expect(typeof tiers['2'].untilMs).toBe('number');
    expect(tiers['2'].untilMs).toBeGreaterThanOrEqual(t0 + realCooldown.MIN_COOLDOWN_MS);
    expect(tiers['1']).toEqual({ coolingDown: false, untilMs: null });
    expect(tiers['3']).toEqual({ coolingDown: false, untilMs: null });
  });

  it('reflects independent tier1 rate-limit + tier3 quota cooldowns, numeric key-set unchanged (SD-4 shape law)', async () => {
    realCooldown.noteRateLimit('tier1');
    realCooldown.noteQuotaExhausted('tier3');
    const { body } = await getHealth();
    const tiers = body.observability.translator.tiers;
    expect(Object.keys(tiers).sort()).toEqual(['1', '2', '3']);
    expect(tiers['1'].coolingDown).toBe(true);
    expect(tiers['2']).toEqual({ coolingDown: false, untilMs: null });
    expect(tiers['3'].coolingDown).toBe(true);
    expect(tiers['3'].untilMs).toBeGreaterThanOrEqual(Date.now() + realCooldown.MAX_COOLDOWN_MS - 1000);
  });
});

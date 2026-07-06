import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-blr4h-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;

// Capture the REAL translator-cooldown BEFORE stubbing (DEC-BLR-24 purity pins below).
const realCooldown = require('../src/translator-cooldown.js');

function stub(p, exports) {
  const id = require.resolve(p);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

let qLen = 0;
let sweepStats = { active: false, startedAt: null, durationMs: null, lastCompletedAt: null };
let tripped = {};
let cooldowns = {};

stub('../src/queue.js', {
  peekLength: async () => qLen,
  drainQueue: async () => [], enqueue: async () => true, enqueueMany: async () => 0,
  getQueue: async () => [], identityKey: () => null, markSweepCycle: () => {},
});
stub('../src/sweeper.js', {
  getSweepStats: () => sweepStats,
  scheduleSweep: async () => {},
  getQueueState: () => ({ active: false, expiresAt: null, isSweeping: false }),
  runSweep: async () => {},
  recoverCrashedSweep: async () => false,
});
stub('../src/services/provider-breaker.js', {
  getTrippedReason: (p) => tripped[p] || null,
  isTmdbAuthError: () => false, isOmdbAuthError: () => false,
  isTmdbRateLimitError: () => false, isOmdbRateLimitError: () => false,
  isOmdbQuotaExhausted: () => false,
  trip: () => {}, tripRate: () => {}, tripQuota: () => {},
  isTripped: () => false, reset: () => {}, resetCycle: () => {},
});
stub('../src/translator-cooldown.js', {
  getCooldownUntil: (t) => (cooldowns[t] != null ? cooldowns[t] : null),
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

async function getHealth() {
  const r = await fetch(`${base}/health`);
  return { http: r.status, body: await r.json() };
}

describe('/health observability sibling (BLR Phase 4, BLR SD-4 / DEC-BLR-14)', () => {
  it('preserves the legacy envelope and adds exactly one sibling', async () => {
    const { http, body } = await getHealth();
    expect(Object.keys(body).sort()).toEqual(['checks', 'observability', 'status', 'time']);
    expect(['ok', 'degraded']).toContain(body.status);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
    expect(typeof body.checks.queue.ok).toBe('boolean');
    expect(typeof body.checks.config.ok).toBe('boolean');
    const allOk = body.checks.queue.ok && body.checks.config.ok;
    expect(http).toBe(allOk ? 200 : 503);
    expect(body.status).toBe(allOk ? 'ok' : 'degraded');
  });

  it('reports the idle state (empty queue, no sweep, no trips, no cooldowns)', async () => {
    qLen = 0; tripped = {}; cooldowns = {};
    sweepStats = { active: false, startedAt: null, durationMs: null, lastCompletedAt: null };
    const { body } = await getHealth();
    const obs = body.observability;
    expect(obs.queue.len).toBe(0);
    expect(obs.queue.max).toBeGreaterThan(0);
    expect(obs.queue.pct).toBe(0);
    expect(obs.sweep).toEqual(sweepStats);
    expect(obs.providers).toEqual({ tmdb: { status: 'ok' }, omdb: { status: 'ok' } });
    expect(obs.translator.tiers).toEqual({
      1: { coolingDown: false, untilMs: null },
      2: { coolingDown: false, untilMs: null },
      3: { coolingDown: false, untilMs: null },
    });
  });

  it('reflects a loaded state (depth, provider reasons, tier cooldown, sweep stats)', async () => {
    qLen = 40;
    tripped = { tmdb: 'rate', omdb: 'quota' };
    const until = Date.now() + 60000;
    cooldowns = { tier2: until };
    sweepStats = { active: false, startedAt: '2026-07-02T00:00:00.000Z', durationMs: 1234, lastCompletedAt: '2026-07-02T00:00:01.234Z' };
    const { body } = await getHealth();
    const obs = body.observability;
    expect(obs.queue.len).toBe(40);
    expect(obs.queue.pct).toBe(Math.round((40 / obs.queue.max) * 100));
    expect(obs.providers.tmdb.status).toBe('rate');
    expect(obs.providers.omdb.status).toBe('quota');
    expect(obs.translator.tiers['2']).toEqual({ coolingDown: true, untilMs: until });
    expect(obs.translator.tiers['1']).toEqual({ coolingDown: false, untilMs: null });
    expect(obs.sweep).toEqual(sweepStats);
  });

  it('emits enum/number-only shapes -- no secrets, URLs, or error text (DEC-BLR-14)', async () => {
    qLen = 1; tripped = { tmdb: 'auth' }; cooldowns = {};
    const { body } = await getHealth();
    const obs = body.observability;
    expect(Object.keys(obs).sort()).toEqual(['providers', 'queue', 'sweep', 'translator']);
    expect(Object.keys(obs.queue).sort()).toEqual(['len', 'max', 'pct']);
    expect(Object.keys(obs.sweep).sort()).toEqual(['active', 'durationMs', 'lastCompletedAt', 'startedAt']);
    expect(Object.keys(obs.providers.tmdb)).toEqual(['status']);
    expect(Object.keys(obs.providers.omdb)).toEqual(['status']);
    for (const t of ['1', '2', '3']) {
      expect(Object.keys(obs.translator.tiers[t]).sort()).toEqual(['coolingDown', 'untilMs']);
    }
    expect(['ok', 'auth', 'rate', 'quota']).toContain(obs.providers.tmdb.status);
    expect(['ok', 'auth', 'rate', 'quota']).toContain(obs.providers.omdb.status);
  });
});

describe('translator-cooldown.getCooldownUntil (DEC-BLR-24 -- pure, non-mutating)', () => {
  it('returns null for a tier with no cooldown', () => {
    realCooldown.clear();
    expect(realCooldown.getCooldownUntil(1)).toBeNull();
  });

  it('returns the untilMs timestamp while cooling, without mutating state', () => {
    realCooldown.clear();
    const t0 = Date.now();
    realCooldown.noteRateLimit(1);
    const a = realCooldown.getCooldownUntil(1);
    const b = realCooldown.getCooldownUntil(1);
    expect(typeof a).toBe('number');
    expect(a).toBeGreaterThanOrEqual(t0 + realCooldown.MIN_COOLDOWN_MS);
    expect(b).toBe(a);
    expect(realCooldown.isCoolingDown(1)).toBe(true);
    realCooldown.clear();
  });

  it('returns null again after clear()', () => {
    realCooldown.noteRateLimit(3);
    realCooldown.clear();
    expect(realCooldown.getCooldownUntil(3)).toBeNull();
  });
});

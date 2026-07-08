import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const NOTIF_ID    = require.resolve('../src/services/notifications.js');
const TELEGRAM_ID = require.resolve('../src/telegram.js');
const CONFIG_ID   = require.resolve('../src/config.js');

function stub(id, exports) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

let sendCalls;
let sleepCalls;
let sendImpl;
let configObj;

function install(delayMs) {
  sendCalls = [];
  sleepCalls = [];
  stub(TELEGRAM_ID, {
    sendPhoto: async () => { const i = sendCalls.length; sendCalls.push(i); return sendImpl(i); },
    sleep: async (ms) => { sleepCalls.push(ms); },
  });
  configObj = { telegram: { delayMs } };
  stub(CONFIG_ID, configObj);
}

function freshDispatch() {
  delete require.cache[NOTIF_ID];
  return require('../src/services/notifications.js').dispatchBatch;
}

const msgs = (n) => Array.from({ length: n }, (_, i) => ({ photoUrl: 'p' + i, caption: 'c' + i }));
const hist = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('dispatchBatch adaptive 429 throttle (STEP 1.4 / WR-15 / O-4)', () => {
  beforeEach(() => { sendImpl = () => ({ rateLimited: false }); });

  it('no 429: paces exactly at delayMs (parity)', async () => {
    install(500);
    sendImpl = () => ({ rateLimited: false });
    const dispatchBatch = freshDispatch();
    const r = await dispatchBatch(msgs(3), hist(3));
    expect(sleepCalls).toEqual([500, 500]);
    expect(r.successful).toHaveLength(3);
    expect(r.failed).toHaveLength(0);
  });

  it('429 with retry_after raises effective delay for the remainder (never below delayMs)', async () => {
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true, retryAfterMs: 5000 } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(3), hist(3));
    expect(sleepCalls).toEqual([5000, 5000]);
    for (const ms of sleepCalls) expect(ms).toBeGreaterThanOrEqual(500);
  });

  it('does not mutate the saved config.telegram.delayMs', async () => {
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true, retryAfterMs: 9000 } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));
    expect(configObj.telegram.delayMs).toBe(500);
  });

  it('hard failure (no rateLimited) lands in failed, is not looped, and does not bump pacing', async () => {
    install(500);
    sendImpl = (i) => {
      if (i === 1) { const e = new Error('Forbidden'); e.rateLimited = false; throw e; }
      return { rateLimited: false };
    };
    const dispatchBatch = freshDispatch();
    const r = await dispatchBatch(msgs(3), hist(3));
    expect(r.successful).toHaveLength(2);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].item).toEqual({ id: 1 });
    expect(r.failed[0].error).toBe('Forbidden');
    expect(sendCalls).toHaveLength(3);
    expect(sleepCalls).toEqual([500, 500]);
  });
  it('FA-2/D-2a: passes through err.retryable on a failed send', async () => {
    install(500);
    sendImpl = (i) => {
      if (i === 0) { const e = new Error('Too Many Requests'); e.rateLimited = false; e.retryable = true; throw e; }
      return { rateLimited: false };
    };
    const dispatchBatch = freshDispatch();
    const r = await dispatchBatch(msgs(2), hist(2));
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].retryable).toBe(true);
  });
  it('FA-2/D-2a: defaults retryable to false when the thrown error omits it', async () => {
    install(500);
    sendImpl = (i) => {
      if (i === 0) { const e = new Error('Forbidden'); e.rateLimited = false; throw e; }
      return { rateLimited: false };
    };
    const dispatchBatch = freshDispatch();
    const r = await dispatchBatch(msgs(2), hist(2));
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].retryable).toBe(false);
  });

  it('persistent 429 that THROWS still paces the remainder (catch-path signal)', async () => {
    install(500);
    sendImpl = (i) => {
      if (i === 0) { const e = new Error('Too Many Requests'); e.rateLimited = true; e.retryAfterMs = 4000; throw e; }
      return { rateLimited: false };
    };
    const dispatchBatch = freshDispatch();
    const r = await dispatchBatch(msgs(3), hist(3));
    expect(r.failed).toHaveLength(1);
    expect(r.successful).toHaveLength(2);
    expect(sleepCalls).toEqual([4000, 4000]);
  });

  it('429 without retry_after bumps multiplicatively, stays >= delayMs and <= cap', async () => {
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(3), hist(3));
    expect(sleepCalls[0]).toBe(1000);
    expect(sleepCalls[1]).toBe(1000);
    for (const ms of sleepCalls) { expect(ms).toBeGreaterThanOrEqual(500); expect(ms).toBeLessThanOrEqual(60000); }
  });

  it('retry_after beyond the cap is clamped to ADAPTIVE_MAX_DELAY_MS', async () => {
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true, retryAfterMs: 999999 } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));
    expect(sleepCalls).toEqual([60000]);
  });

  it('empty / non-array messages returns empty result and never sleeps (parity guard)', async () => {
    install(500);
    const dispatchBatch = freshDispatch();
    expect(await dispatchBatch([], [])).toEqual({ successful: [], failed: [] });
    expect(await dispatchBatch(null, null)).toEqual({ successful: [], failed: [] });
    expect(sleepCalls).toEqual([]);
  });
});

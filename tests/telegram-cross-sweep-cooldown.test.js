import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// Phase 2 / G2: a sustained Telegram cooldown (observed via a 429's retry_after)
// must be honored at the START of the NEXT dispatchBatch run too, not just for
// the remainder of the run that observed it. cooldownUntilMs is module-scoped, so
// these tests deliberately call freshDispatch() ONCE per test and reuse the SAME
// dispatchBatch reference across multiple calls -- the opposite of dispatch-adaptive
// .test.js's per-test isolation -- to exercise that persistence.
describe('dispatchBatch cross-sweep cooldown memory (Phase 2 / G2)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a 429 with retry_after in one run defers the START of the next run, proportional to remaining cooldown', async () => {
    vi.setSystemTime(0);
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true, retryAfterMs: 9000 } : { rateLimited: false });
    const dispatchBatch = freshDispatch();

    await dispatchBatch(msgs(2), hist(2));

    vi.setSystemTime(4000); // wall clock advances between runs (sweep processing time)
    sendImpl = () => ({ rateLimited: false });
    sleepCalls = [];

    await dispatchBatch(msgs(2), hist(2));

    expect(sleepCalls[0]).toBe(5000); // remaining cooldown: 9000 - 4000
    expect(sleepCalls[1]).toBe(500);  // then normal pace resumes
  });

  it('no cooldown active: a fresh run sleeps only at the normal pace (parity)', async () => {
    vi.setSystemTime(0);
    install(500);
    sendImpl = () => ({ rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));
    expect(sleepCalls).toEqual([500]);
  });

  it('a cooldown that has already elapsed by the next run adds no extra sleep', async () => {
    vi.setSystemTime(0);
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true, retryAfterMs: 1000 } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));

    vi.setSystemTime(5000); // well past the 1000ms cooldown
    sendImpl = () => ({ rateLimited: false });
    sleepCalls = [];
    await dispatchBatch(msgs(2), hist(2));
    expect(sleepCalls).toEqual([500]);
  });

  it('a bare 429 with no retry_after does NOT set a cross-sweep cooldown', async () => {
    vi.setSystemTime(0);
    install(500);
    sendImpl = (i) => (i === 0 ? { rateLimited: true } : { rateLimited: false });
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));

    vi.setSystemTime(100); // barely any time passed
    sendImpl = () => ({ rateLimited: false });
    sleepCalls = [];
    await dispatchBatch(msgs(2), hist(2));
    expect(sleepCalls).toEqual([500]); // no leading cooldown sleep
  });

  it('a 429 surfaced via the THROW path also sets the cross-sweep cooldown', async () => {
    vi.setSystemTime(0);
    install(500);
    sendImpl = (i) => {
      if (i === 0) { const e = new Error('Too Many Requests'); e.rateLimited = true; e.retryAfterMs = 3000; throw e; }
      return { rateLimited: false };
    };
    const dispatchBatch = freshDispatch();
    await dispatchBatch(msgs(2), hist(2));

    vi.setSystemTime(1000);
    sendImpl = () => ({ rateLimited: false });
    sleepCalls = [];
    await dispatchBatch(msgs(2), hist(2));
    expect(sleepCalls[0]).toBe(2000); // remaining cooldown: 3000 - 1000
  });
});

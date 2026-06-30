'use strict';
const { sendPhoto, sleep } = require('../telegram');
const config = require('../config');

// In-run adaptive Telegram throttle (Roadmap STEP 1.4 / WR-15 / O-4).
// The saved baseline delayMs is the proactive floor and is NEVER mutated.
// On an observed 429 (surfaced by telegram.sendPhoto via its success-return
// rateLimited flag OR its thrown error - STEP 1.2 contract), we raise an
// in-memory effectiveDelay for the REMAINDER of the current dispatchBatch run
// only, so the next sends do not immediately re-trip. The value is local
// (reset per run) and adaptive-only by default (O-4): starts at the baseline
// and only grows.
const ADAPTIVE_MAX_DELAY_MS = 60000; // hard ceiling on one inter-send sleep
const ADAPTIVE_BACKOFF_FACTOR = 2;   // bump when a 429 carries no retry_after

// Cross-sweep cooldown memory (Roadmap Phase 2 / G2). dispatchBatch's adaptive
// effectiveDelay above is scoped to ONE call (resets every run) -- a sustained
// 429 cooldown was lost between sweeps. cooldownUntilMs is MODULE-scoped (not
// per-call) so a cooldown observed in one dispatchBatch run is honored at the
// START of the next one too. In-memory only (resets on process restart) -- an
// acceptable, sufficient boundary per YAGNI/context-fit (this closes the
// "next sweep starts cold mid-outage" gap, not a restart-survival requirement).
let cooldownUntilMs = 0;

// Pure: is this a usable retry_after signal (matches nextAdaptiveDelay's own check).
function isValidRetryAfter(ms) {
  return typeof ms === 'number' && Number.isFinite(ms) && ms > 0;
}

// Record a cross-sweep cooldown from an observed retry_after. No-op when the
// signal is absent/invalid (a bare 429 with no retry_after still bumps the
// in-call effectiveDelay via nextAdaptiveDelay, but does not set a persisted
// cooldown -- there is no concrete "until" time to honor across sweeps).
function maybeSetCooldown(retryAfterMs) {
  if (isValidRetryAfter(retryAfterMs)) {
    cooldownUntilMs = Date.now() + retryAfterMs;
  }
}

// Pure: next effective inter-send delay given the current value, the baseline
// floor, and an optional observed retry_after (ms). Monotonic non-decreasing,
// floored at baseDelay, capped at ADAPTIVE_MAX_DELAY_MS.
function nextAdaptiveDelay(current, baseDelay, retryAfterMs) {
  const floor = Math.max(current, baseDelay);
  const target = isValidRetryAfter(retryAfterMs)
    ? Math.max(floor, retryAfterMs)
    : floor * ADAPTIVE_BACKOFF_FACTOR;
  return Math.min(ADAPTIVE_MAX_DELAY_MS, Math.max(baseDelay, target));
}

async function dispatchBatch(messages, historyItems) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { successful: [], failed: [] };
  }

  const successful = [];
  const failed = [];
  const DELAY = config.telegram.delayMs;
  let effectiveDelay = DELAY;

  // Honor a cooldown set by a PRIOR dispatchBatch run (cross-sweep memory) before
  // the first send of THIS run.
  const now = Date.now();
  if (now < cooldownUntilMs) {
    await sleep(cooldownUntilMs - now);
  }

  for (let i = 0; i < messages.length; i++) {
    try {
      const res = await sendPhoto(messages[i].photoUrl, messages[i].caption);
      successful.push(historyItems[i]);
      if (res && res.rateLimited) {
        effectiveDelay = nextAdaptiveDelay(effectiveDelay, DELAY, res.retryAfterMs);
        maybeSetCooldown(res.retryAfterMs);
      }
    } catch (err) {
      failed.push({
        item: historyItems[i],
        error: err.message
      });
      if (err && err.rateLimited) {
        effectiveDelay = nextAdaptiveDelay(effectiveDelay, DELAY, err.retryAfterMs);
        maybeSetCooldown(err.retryAfterMs);
      }
    }
    
    // Apply rate-limiting sleep between dispatches (skip after the last item)
    if (i < messages.length - 1) {
      await sleep(effectiveDelay);
    }
  }

  return { successful, failed };
}

module.exports = { dispatchBatch };

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

// Pure: next effective inter-send delay given the current value, the baseline
// floor, and an optional observed retry_after (ms). Monotonic non-decreasing,
// floored at baseDelay, capped at ADAPTIVE_MAX_DELAY_MS.
function nextAdaptiveDelay(current, baseDelay, retryAfterMs) {
  const floor = Math.max(current, baseDelay);
  const target = (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0)
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

  for (let i = 0; i < messages.length; i++) {
    try {
      const res = await sendPhoto(messages[i].photoUrl, messages[i].caption);
      successful.push(historyItems[i]);
      if (res && res.rateLimited) {
        effectiveDelay = nextAdaptiveDelay(effectiveDelay, DELAY, res.retryAfterMs);
      }
    } catch (err) {
      failed.push({
        item: historyItems[i],
        error: err.message
      });
      if (err && err.rateLimited) {
        effectiveDelay = nextAdaptiveDelay(effectiveDelay, DELAY, err.retryAfterMs);
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

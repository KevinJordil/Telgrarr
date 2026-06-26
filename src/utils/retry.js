'use strict';

// Pure, framework-agnostic retry primitive: no I/O, no logging, no config — the
// CALLER logs and decides retryability. Used by telegram.js (per-send 429/transient)
// and translator.js (per-tier 429 before escalation). Roadmap WR-10 / C-GUARD / STEP 1.1.
//
// Contract:
//  - Honors an explicit retry_after LITERALLY (never shorter), even beyond maxDelayMs.
//  - Otherwise exponential backoff (baseDelayMs * 2^n) capped at maxDelayMs.
//  - Additive jitter (never negative => a honored retry_after stays >= literal).
//  - Stops after maxAttempts; never retries when shouldRetry(err) === false.

const DEFAULT_MAX_ATTEMPTS = 4;       // initial attempt + 3 retries
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10000;   // caps the EXPONENTIAL branch only
const JITTER_RATIO = 0.25;            // additive jitter window: +0%..+25% of base

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryWithBackoff(fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('retryWithBackoff: fn must be a function');
  }

  const {
    shouldRetry = () => true,
    getRetryAfterMs,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    jitter = true,
    sleepFn = realSleep,
    random = Math.random,
  } = options;

  const requested = Math.floor(Number(maxAttempts));
  const attempts = Number.isFinite(requested) && requested >= 1 ? requested : DEFAULT_MAX_ATTEMPTS;

  function waitMsFor(err, failedAttemptNo) {
    let base;
    const ra = typeof getRetryAfterMs === 'function' ? getRetryAfterMs(err) : undefined;
    if (typeof ra === 'number' && Number.isFinite(ra) && ra > 0) {
      base = ra; // literal honor — intentionally NOT capped by maxDelayMs
    } else {
      base = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, failedAttemptNo - 1));
    }
    return base + (jitter ? random() * JITTER_RATIO * base : 0);
  }

  return (async () => {
    let lastErr;
    for (let attemptNo = 1; attemptNo <= attempts; attemptNo += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (attemptNo >= attempts || !shouldRetry(err)) throw err;
        await sleepFn(waitMsFor(err, attemptNo));
      }
    }
    throw lastErr; // defensive; loop always returns or throws
  })();
}

module.exports = { retryWithBackoff, JITTER_RATIO };

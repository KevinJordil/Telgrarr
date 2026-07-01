'use strict';
// [BLR Phase 2 / DEC-BLR-5..8] Translator-tier cooldown memory.
//
// Sibling-class of services/provider-breaker.js: a pure, in-process module
// that remembers "this tier is cooling down until T" so the cascade skips it
// instead of burning another round-trip. Restart-forgets — mirrors the
// notifications.js cooldownUntilMs precedent (DEC-BLR-7 / Master §0
// context-fit: single-user self-hosted).
//
// Contract (public API):
//   isCoolingDown(tier)                   -> boolean
//   noteRateLimit(tier, retryAfterMs?)    -> void  (429 or T3 non-2xx)
//   noteQuotaExhausted(tier)              -> void  (DeepL 456 / OpenAI
//                                                   insufficient_quota /
//                                                   Google quotaExceeded)
//   clear()                               -> void  (tests only)
//
// R13 SSoT (constants declared here, never elsewhere):
//   MIN_COOLDOWN_MS     =   5_000   // jitter + provider tolerance floor
//   DEFAULT_COOLDOWN_MS =  60_000   // bare 429, no Retry-After
//   MAX_COOLDOWN_MS     = 300_000   // 5 min ceiling; quota pins here (DEC-BLR-6)

const MIN_COOLDOWN_MS     =   5_000;
const DEFAULT_COOLDOWN_MS =  60_000;
const MAX_COOLDOWN_MS     = 300_000;

const untilByTier = new Map();

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function isCoolingDown(tier) {
  const until = untilByTier.get(tier);
  if (!until) return false;
  if (Date.now() >= until) { untilByTier.delete(tier); return false; }
  return true;
}

function noteRateLimit(tier, retryAfterMs) {
  const requested = typeof retryAfterMs === 'number'
      && Number.isFinite(retryAfterMs)
      && retryAfterMs > 0
    ? retryAfterMs
    : DEFAULT_COOLDOWN_MS;
  const window = clamp(requested, MIN_COOLDOWN_MS, MAX_COOLDOWN_MS);
  untilByTier.set(tier, Date.now() + window);
}

function noteQuotaExhausted(tier) {
  // Quota refresh cycles (daily/monthly) do NOT align with our cooldown
  // scale — pin at ceiling so the cascade re-checks every MAX window, no
  // more (DEC-BLR-6). Waiting on a monthly quota Retry-After is pointless.
  untilByTier.set(tier, Date.now() + MAX_COOLDOWN_MS);
}

function clear() { untilByTier.clear(); }

module.exports = {
  isCoolingDown,
  noteRateLimit,
  noteQuotaExhausted,
  clear,
  MIN_COOLDOWN_MS,
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
};

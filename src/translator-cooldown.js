'use strict';
// BLR Phase 4: events.js is the ONE sanctioned app require in this module --
// it sits at the BOTTOM of the require chain (logger itself requires events),
// so no cycle is possible; the pure no-logger/no-config posture holds.
const events = require('./events');
const EVENT_TYPES = require('../shared/events.json');
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
// -- BLR Phase 4: cooldown observability (once per tier per sweep cycle) --
// Re-armed at sweep start via resetCycle(id); id is accepted for call-site
// symmetry with queue.markSweepCycle and is not otherwise consumed.
const _notifiedThisCycle = new Set();
function resetCycle(id) { _notifiedThisCycle.clear(); }
function _notifyCooled(tier, reason, untilMs) {
  if (_notifiedThisCycle.has(tier)) return;
  _notifiedThisCycle.add(tier);
  events.emit(
    EVENT_TYPES.TRANSLATOR_TIER_COOLED, 'warn', 'Translator',
    'Tier ' + tier + ' cooling down (' + reason + ')',
    { tier, reason, untilMs }
  );
}

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
  const until = Date.now() + window;
  untilByTier.set(tier, until);
  _notifyCooled(tier, 'rate', until);
}

function noteQuotaExhausted(tier) {
  // Quota refresh cycles (daily/monthly) do NOT align with our cooldown
  // scale — pin at ceiling so the cascade re-checks every MAX window, no
  // more (DEC-BLR-6). Waiting on a monthly quota Retry-After is pointless.
  const until = Date.now() + MAX_COOLDOWN_MS;
  untilByTier.set(tier, until);
  _notifyCooled(tier, 'quota', until);
}

function clear() { untilByTier.clear(); }

module.exports = {
  isCoolingDown,
  noteRateLimit,
  noteQuotaExhausted,
  clear,
  resetCycle,
  MIN_COOLDOWN_MS,
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
};

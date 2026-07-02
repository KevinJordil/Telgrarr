'use strict';
// BLR Phase 4: events.js is the ONE sanctioned app require in this module --
// it sits at the BOTTOM of the require chain (logger itself requires events),
// so no cycle is possible; the no-logger/no-config constraint below holds.
const events = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
// Provider auth-failure breaker (P6.1a), extended (BLR Phase 3 / C-6) to a
// reason-classified latch: auth | rate | quota. Recognizes a provider
// key/auth failure, a volumetric 429, or a daily-quota exhaustion and
// records it for the duration of ONE sweep, so the sweeper never re-hits a
// provider with a known-bad/limited/exhausted state for every item in the
// batch (anti-spam, DEC-BLR-9 - sweep-scoped for ALL reasons). State is
// reset at each sweep start (sweeper.runSweep). Auth classifiers mirror the
// app's existing auth judgments (connection-tester testTmdb/testOmdb) - ONE
// source (QB-4/R02).
//
// TMDb bad key: HTTP 401, OR body status_code 7|10|3 (invalid / suspended / auth-failed).
// TMDb rate limit: HTTP 429.
// OMDb bad key: HTTP 200 with body Error matching /invalid api key/i - OMDb does NOT
//   throw for a bad key. A thrown OMDb error is transient (network/HTTP), never auth.
// OMDb rate limit: HTTP 429 (thrown).
// OMDb quota exhausted: HTTP 200 with body Error matching /daily request limit reached/i
//   (free-tier daily cap) - distinct from a bad key; also non-throwing.
// Pure module: zero requires (no logger/config) - cannot form a require cycle.

const TMDB_AUTH_STATUS_CODES = [7, 10, 3];

function isTmdbAuthError(err) {
  if (!err) return false;
  const code = err.response && err.response.data && err.response.data.status_code;
  return (err.response && err.response.status === 401) || TMDB_AUTH_STATUS_CODES.includes(code);
}

function isOmdbAuthError(resData) {
  return !!(resData && resData.Error && /invalid api key/i.test(resData.Error));
}

function isTmdbRateLimitError(err) {
  if (!err) return false;
  return !!(err.response && err.response.status === 429);
}

function isOmdbRateLimitError(err) {
  if (!err) return false;
  return !!(err.response && err.response.status === 429);
}

function isOmdbQuotaExhausted(resData) {
  return !!(resData && resData.Error && /daily request limit reached/i.test(resData.Error));
}

const REASON_AUTH = 'auth';
const REASON_RATE = 'rate';
const REASON_QUOTA = 'quota';

// provider -> reason ('auth'|'rate'|'quota'). Map (not Set) so callers/observability
// (BLR Phase 4) can distinguish WHY a provider is sidelined this sweep.
const trippedMap = new Map();
// -- BLR Phase 4: trip observability (once per provider+reason per cycle) --
// Re-armed at sweep start via resetCycle(id); id is accepted for call-site
// symmetry with queue.markSweepCycle and is not otherwise consumed.
const _notifiedThisCycle = new Set();
function resetCycle(id) { _notifiedThisCycle.clear(); }
function _notifyTripped(provider, reason) {
  const key = provider + ':' + reason;
  if (_notifiedThisCycle.has(key)) return;
  _notifiedThisCycle.add(key);
  events.emit(
    EVENT_TYPES.PROVIDER_TRIPPED, 'warn', 'Breaker',
    'Provider ' + provider + ' sidelined for this sweep (' + reason + ')',
    { provider, reason }
  );
}

function trip(provider, reason = REASON_AUTH) { trippedMap.set(provider, reason); _notifyTripped(provider, reason); }
function tripRate(provider)                   { trippedMap.set(provider, REASON_RATE); _notifyTripped(provider, REASON_RATE); }
function tripQuota(provider)                  { trippedMap.set(provider, REASON_QUOTA); _notifyTripped(provider, REASON_QUOTA); }
function isTripped(provider)                  { return trippedMap.has(provider); }
function getTrippedReason(provider)           { return trippedMap.get(provider) || null; }
function reset()                              { trippedMap.clear(); }

module.exports = {
  isTmdbAuthError,
  isOmdbAuthError,
  isTmdbRateLimitError,
  isOmdbRateLimitError,
  isOmdbQuotaExhausted,
  trip,
  tripRate,
  tripQuota,
  isTripped,
  getTrippedReason,
  reset,
  resetCycle,
};

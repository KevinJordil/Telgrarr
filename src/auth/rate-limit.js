'use strict';

// C.4b / S5 — SOFT progressive login backoff (NO hard lockout). Repeated failures for
// the same (IP+username) accrue a small, capped, self-clearing response DELAY that
// raises brute-force cost on top of scrypt — but a correct password ALWAYS succeeds, so
// no one can lock the admin out (admin-DoS). This matters because behind a reverse
// proxy/tunnel the IP half of the key can collapse to the proxy's IP, degrading the key
// to username-only. Cleared on success; a process RESTART clears everything. Pure logic,
// no logging (SRP). Memory is HARD-bounded by MAX_KEYS with oldest-first (LRU) eviction
// so a key-spray (50k random IP/user combos) cannot grow the Map until OOM.

const STEP_MS   = 500;                 // added delay per failure beyond the first
const MAX_DELAY = 5000;                // delay ceiling (ms) — bounds held sockets
const RESET_MS  = 15 * 60 * 1000;      // idle window after which a key's count resets
const MAX_KEYS  = 1024;                // hard volumetric cap (anti-OOM)

const attempts = new Map();            // key -> { fails, last }; insertion order = LRU

function keyFor(ip, username) {
  return `${ip || 'unknown'}|${username || ''}`;
}

// Record one failed attempt; return the response delay (ms) to apply for THIS attempt.
function recordFailure(ip, username, now = Date.now()) {
  const k = keyFor(ip, username);
  let e = attempts.get(k);
  if (e) attempts.delete(k);                              // pull out so re-set lands at MRU
  if (e && (now - e.last) > RESET_MS) e = undefined;      // idle -> forget the count
  e = e || { fails: 0, last: 0 };
  e.fails += 1;
  e.last = now;
  attempts.set(k, e);
  while (attempts.size > MAX_KEYS) {                      // evict least-recently-failed
    const oldest = attempts.keys().next().value;
    if (oldest === undefined) break;
    attempts.delete(oldest);
  }
  return Math.min((e.fails - 1) * STEP_MS, MAX_DELAY);
}

function clear(ip, username) {
  attempts.delete(keyFor(ip, username));
}

function size() { return attempts.size; }                // introspection / test helper

module.exports = { recordFailure, clear, size, STEP_MS, MAX_DELAY, RESET_MS, MAX_KEYS };

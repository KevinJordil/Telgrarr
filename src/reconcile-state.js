'use strict';
const fs     = require('fs');
const path   = require('path');
const write  = require('write-file-atomic');
const config = require('./config');
const log    = require('./logger');

// Reconcile dedup/cursor ledger (Roadmap STEP 2.1 / WR-3 / WR-7 / WR-13 / C-LEDGER).
// Per-source state in reconcile-state.json under config.DATA_DIR (FU-7; NEVER ../data):
//   { sonarr: { since: <ISO|null>, sentKeys: [<identityKey>, … capped] },
//     radarr: { since: <ISO|null>, sentKeys: [ … ] } }
// `since`    = a LOOSE fetch bound (affects cost, never correctness — C-SINCE).
// `sentKeys` = the DEDUP AUTHORITY: a capped ring of queue identityKeys actually SENT,
//              written by the sweeper on confirmed dispatch success (C-LEDGER).
//
// I/O is SYNCHRONOUS atomic (write-file-atomic .sync, R09) with NO lockfile: the app is
// single-instance (D-D / RD-8) so sync writes cannot interleave in-process — this mirrors
// the lockfile-free sync-atomic boot write in config.js. The file is tiny and mutated only
// at boot / hourly / per-batch-success, so the event-loop cost is negligible (context-fit,
// YAGNI). Every mutator is FAIL-SOFT (WR-13): an I/O or parse error is caught + logged
// (R10), never thrown — a ledger failure must never break boot, the sweep, or the other *arr.
const STATE_FILE = path.join(config.DATA_DIR, 'reconcile-state.json');

// Per-source ring cap. SSoT lives HERE (the ring's owner — SRP), NOT in reconciler.js:
// putting every tuning const in reconciler.js (WR-7) would force the cycle
// reconciler -> reconcile-state -> reconciler. reconciler.js re-exports this value for the
// single "tuning consts" surface (one-directional require). Code-level, not schema (WR-7).
const LEDGER_SIZE = 1000;

const SOURCES = ['sonarr', 'radarr'];

function emptyState() {
  return {
    sonarr: { since: null, sentKeys: [] },
    radarr: { since: null, sentKeys: [] },
  };
}

// Coerce one source slice to the contract shape, dropping junk (FAIL-SOFT load).
function normalizeSource(slice) {
  const since = (slice && typeof slice.since === 'string') ? slice.since : null;
  let sentKeys = (slice && Array.isArray(slice.sentKeys))
    ? slice.sentKeys.filter(k => typeof k === 'string' && k.length > 0)
    : [];
  if (sentKeys.length > LEDGER_SIZE) sentKeys = sentKeys.slice(-LEDGER_SIZE);
  return { since, sentKeys };
}

function normalizeState(raw) {
  const out = emptyState();
  if (raw && typeof raw === 'object') {
    for (const s of SOURCES) out[s] = normalizeSource(raw[s]);
  }
  return out;
}

let _state = null;

// Lazy synchronous load into the in-process singleton. Missing/malformed => safe default
// (logged on parse failure, R10), NEVER throws (WR-13).
function ensureLoaded() {
  if (_state) return _state;
  try {
    if (!fs.existsSync(STATE_FILE)) {
      _state = emptyState();
      return _state;
    }
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    _state = normalizeState(JSON.parse(raw));
  } catch (err) {
    log.error('Reconcile', `State Load → Error → ${err.message}`);
    _state = emptyState();
  }
  return _state;
}

// Synchronous atomic persist; FAIL-SOFT (never throws).
function persist() {
  try {
    write.sync(STATE_FILE, JSON.stringify(_state, null, 2) + '\n');
  } catch (err) {
    log.error('Reconcile', `State Save → Error → ${err.message}`);
  }
}

function isKnownSource(source) {
  if (SOURCES.includes(source)) return true;
  log.warn('Reconcile', `State → Unknown source → ${source}`);
  return false;
}

// The live state singleton (read-only intent; mutate ONLY via the setters below).
function getState() {
  return ensureLoaded();
}

// Advance the loose fetch bound for one source (C-SINCE). Accepts an ISO string or null;
// anything else is ignored (FAIL-SOFT).
function setSince(source, iso) {
  if (!isKnownSource(source)) return;
  if (iso !== null && typeof iso !== 'string') {
    log.warn('Reconcile', `State → Invalid since → ${source}`);
    return;
  }
  ensureLoaded();
  _state[source].since = iso;
  persist();
}

// Record identityKeys as SENT (dedup authority, C-LEDGER). Dedups against the existing
// ring (most-recent-wins) and trims to LEDGER_SIZE; no-op on empty / non-array input.
function recordSent(source, idKeys) {
  if (!isKnownSource(source)) return;
  const incoming = Array.isArray(idKeys)
    ? idKeys.filter(k => typeof k === 'string' && k.length > 0)
    : [];
  if (incoming.length === 0) return;
  ensureLoaded();
  const incomingSet = new Set(incoming);
  // Drop any prior occurrence, re-append at the end (refresh recency), then ring-trim.
  let merged = _state[source].sentKeys.filter(k => !incomingSet.has(k));
  merged = merged.concat([...incomingSet]);
  if (merged.length > LEDGER_SIZE) merged = merged.slice(-LEDGER_SIZE);
  _state[source].sentKeys = merged;
  persist();
}

// Has this identityKey already been sent for this source? Unknown source or unseen key
// => false (the lossless-safe direction: false => still eligible to send).
function isSent(source, idKey) {
  if (!SOURCES.includes(source)) return false;
  ensureLoaded();
  return _state[source].sentKeys.includes(idKey);
}

module.exports = { getState, setSince, recordSent, isSent, LEDGER_SIZE };

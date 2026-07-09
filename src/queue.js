'use strict';
const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const lockfile  = require('proper-lockfile');
const writeAtomic = require('write-file-atomic');
// F16/D-3 (Architect-ratified): the 4 in-lock queue writes below disable the
// per-write disk fsync -- a DECLARED divergence from blacklist.js's 2-arg call
// shape. Atomicity is fully preserved (temp-file + rename; a torn/partial write
// can never become visible); only the fsync durability step is skipped.
// media_queue.json is regenerable operational state (the reconciler re-seeds
// from *arr history at boot), and write-file-atomic's unconditional default
// fsync measured ~26ms/write here -- eroding the BCS P5/F6 burst-latency margin.
const config    = require('./config');
const log       = require('./logger');
const events    = require('./events');
const EVENT_TYPES = require('../shared/events.json');

const QUEUE_FILE = config.queueFile;

// -- BCS P5 / F6: in-process serialization ahead of the FS lock. ------------
// RD-8 already guarantees no second OS process shares this DATA_DIR; the FS
// lock's retries:10/minTimeout:50 budget only needs to cover that genuine
// cross-process case. Verified this session: under a 408-concurrent-call
// burst, intra-process contention alone drove 354/408 calls to exhaust that
// entire budget (measured ~51.7s runtime against the retry package's default
// factor:2 backoff ceiling of ~51.15s) and throw ELOCKED. A plain promise-
// chain mutex here means only ONE in-process caller ever attempts the FS lock
// at a time -- the FS lock itself is untouched, still the correctness backstop.
let _queueMutexTail = Promise.resolve();
function withQueueMutex(fn) {
  const turn = _queueMutexTail.then(fn, fn);
  _queueMutexTail = turn.then(() => {}, () => {});
  return turn;
}

// -- BLR Phase 4: queue observability (DEC-BLR-13/17/18) ---------------------
// QUEUE_OVERFLOW: emitted adjacent to the existing pre-write audit log (same
// exposure); enqueueMany rolls its whole eviction loop into ONE event with a
// total droppedCount (DEC-BLR-17) -- never one event per dropped item.
// QUEUE_DEPTH_WARNING: strict > 80% of maxItems (DEC-BLR-13, R13), at most
// once per sweep cycle; the sweeper advances the cycle at each sweep start.
const DEPTH_WARN_PCT = 0.8;
let _currentSweepCycle = 0;
let _lastWarnSweepCycle = null;

function markSweepCycle(id) {
  _currentSweepCycle = id;
}

function emitOverflowEvent(droppedCount, maxItems) {
  events.emit(
    EVENT_TYPES.QUEUE_OVERFLOW, 'warn', 'Queue',
    `Queue overflow: dropped ${droppedCount} oldest item(s) [cap ${maxItems}]`,
    { droppedCount, maxItems }
  );
}

function checkDepthWarning(depth, maxItems) {
  if (depth <= maxItems * DEPTH_WARN_PCT) return;
  if (_lastWarnSweepCycle === _currentSweepCycle) return;
  _lastWarnSweepCycle = _currentSweepCycle;
  const pct = Math.round((depth / maxItems) * 100);
  events.emit(
    EVENT_TYPES.QUEUE_DEPTH_WARNING, 'warn', 'Queue',
    `Queue depth ${depth}/${maxItems} (${pct}%) exceeded ${DEPTH_WARN_PCT * 100}% threshold`,
    { depth, maxItems, pct }
  );
}

function ensureQueueFile() {
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, '[]', 'utf8');
    log.info('Queue', 'Queue Initialization → Success → Empty array created');
  }
}

// -- BCS P2 / F2 (FLAG B): quarantine-and-reset. Called ONLY inside a held
// lock (getQueue/enqueue/enqueueMany/drainQueue); peekLength's lock-free
// transient read must NEVER quarantine. A poisoned snapshot (unparseable, or
// valid JSON that is not an array) is renamed to media_queue.corrupt.<ts>.json
// for forensics, the live file is re-initialized to '[]', and
// QUEUE_CORRUPT_RESET is emitted -- one bad write no longer means silent
// permanent ingest loss until manual repair.
function readQueueSafe() {
  const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
  let data = null;
  let reason = null;
  try {
    data = JSON.parse(raw);
  } catch (parseErr) {
    reason = parseErr.message;
  }
  if (reason === null && !Array.isArray(data)) reason = 'snapshot is not an array';
  if (reason === null) return data;
  const base = QUEUE_FILE.endsWith('.json') ? QUEUE_FILE.slice(0, -5) : QUEUE_FILE;
  const quarantinePath = `${base}.corrupt.${Date.now()}.json`;
  const quarantineName = path.basename(quarantinePath);
  try {
    fs.renameSync(QUEUE_FILE, quarantinePath);
  } catch (renameErr) {
    log.error('Queue', `Queue Quarantine → Rename Error → ${renameErr.message}`);
  }
  writeAtomic.sync(QUEUE_FILE, '[]', { fsync: false });
  log.error('Queue', `Queue Read → Corrupt → Quarantined and reset → ${quarantineName}`);
  events.emit(
    EVENT_TYPES.QUEUE_CORRUPT_RESET, 'error', 'Queue',
    `Corrupt queue snapshot quarantined and reset (${quarantineName})`,
    { quarantineFile: quarantineName, reason }
  );
  return [];
}

async function getQueue() {
  ensureQueueFile();
  let release;
  return withQueueMutex(async () => {
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    return readQueueSafe();
  } catch (err) {
    log.error('Queue', `Queue Read → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
  });
}

function identityKey(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.source === 'sonarr' && item.seriesId != null) {
    if (item.episodeId != null) return `sonarr:${item.seriesId}:eid:${item.episodeId}`;
    if (item.seasonNumber != null && item.episodeNumber != null) {
      return `sonarr:${item.seriesId}:s${item.seasonNumber}e${item.episodeNumber}`;
    }
    // BCS P2 / F7 (FLAG C): no episode identity -- coalesce identical malformed
    // payloads via a stable content fingerprint (volatile fields like
    // _receivedAt excluded by construction).
    const fp = crypto.createHash('sha1').update(`${item.episodeTitle || ''}|${item.quality || ''}`).digest('hex');
    return `sonarr:${item.seriesId}:fp:${fp}`;
  }
  if (item.source === 'radarr' && item.movieId != null) {
    return `radarr:${item.movieId}`;
  }
  return null;
}

async function enqueue(item) {
  ensureQueueFile();
  let release;
  return withQueueMutex(async () => {
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const data = readQueueSafe();
    const source = item.source || 'unknown';
    const trace  = item.traceId || '-';
    const dupKey = identityKey(item);
    if (dupKey !== null && data.some((e) => identityKey(e) === dupKey)) {
      log.info('Queue', `Queue Append → Skipped (duplicate) → Source: [${source}] | Trace: [${trace}] | Key: [${dupKey}]`);
      return false;
    }
    const maxItems = config.queue.maxItems;
    if (data.length >= maxItems) {
      const dropped = data.shift();
      const droppedSource = dropped && dropped.source || 'unknown';
      const droppedTrace  = dropped && dropped.traceId || '-';
      log.audit('Queue', `Queue Overflow \u2192 Dropped oldest \u2192 Source: [${droppedSource}] | Trace: [${droppedTrace}] \u2192 Queue Length capped at ${maxItems}`);
      emitOverflowEvent(1, maxItems);
    }
    data.push(item);
    writeAtomic.sync(QUEUE_FILE, JSON.stringify(data, null, 2), { fsync: false });
    log.info('Queue', `Queue Append → Success → Source: [${source}] | Trace: [${trace}] | Queue Length: ${data.length}`);
    checkDepthWarning(data.length, maxItems);
    return true;
  } catch (err) {
    log.error('Queue', `Queue Append → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
  });
}

async function drainQueue() {
  ensureQueueFile();
  let release;
  return withQueueMutex(async () => {
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const items = readQueueSafe();
    writeAtomic.sync(QUEUE_FILE, '[]', { fsync: false });
    log.info('Queue', `Queue Drain → Success → Drained [${items.length}] item(s)`);
    return items;
  } catch (err) {
    log.error('Queue', `Queue Drain → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
  });
}

// ── BLR-1 / DEC-BLR-4: bulk-insert (single lock per webhook). ────────────
// Sonarr season packs hit this path with up to ~30 items in one call; the
// per-batch overflow eviction (single phase) replaces N interleaved evictions.
async function enqueueMany(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  ensureQueueFile();
  let release;
  return withQueueMutex(async () => {
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const data = readQueueSafe();
    const existingKeys = new Set();
    for (const e of data) {
      const k = identityKey(e);
      if (k !== null) existingKeys.add(k);
    }
    const additions = [];
    for (const item of items) {
      const source = item.source || 'unknown';
      const trace  = item.traceId || '-';
      const dupKey = identityKey(item);
      if (dupKey !== null && existingKeys.has(dupKey)) {
        log.info('Queue', `Queue Append → Skipped (duplicate) → Source: [${source}] | Trace: [${trace}] | Key: [${dupKey}]`);
        continue;
      }
      if (dupKey !== null) existingKeys.add(dupKey);
      additions.push(item);
    }
    if (additions.length === 0) return 0;
    for (const item of additions) data.push(item);
    // Single-phase overflow eviction (DEC-BLR-4): evict the OLDEST items in
    // one tight loop AFTER the push, never interleaved with each push.
    const maxItems = config.queue.maxItems;
    let overflowDropped = 0;
    while (data.length > maxItems) {
      overflowDropped += 1;
      const dropped = data.shift();
      const droppedSource = (dropped && dropped.source) || 'unknown';
      const droppedTrace  = (dropped && dropped.traceId) || '-';
      log.audit('Queue', `Queue Overflow \u2192 Dropped oldest \u2192 Source: [${droppedSource}] | Trace: [${droppedTrace}] \u2192 Queue Length capped at ${maxItems}`);
    }
    if (overflowDropped > 0) emitOverflowEvent(overflowDropped, maxItems);
    writeAtomic.sync(QUEUE_FILE, JSON.stringify(data, null, 2), { fsync: false });
    const firstSource = additions[0].source || 'unknown';
    const firstTrace  = additions[0].traceId || '-';
    log.info('Queue', `Queue Append (Batch) → Success → Source: [${firstSource}] | Trace: [${firstTrace}] | Added: ${additions.length} | Queue Length: ${data.length}`);
    checkDepthWarning(data.length, maxItems);
    return additions.length;
  } catch (err) {
    log.error('Queue', `Queue Append (Batch) → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
  });
}

// ── BLR-1 / DEC-BLR-2: lock-free length read. ────────────────────────────────
// RD-8 single-instance guarantees no other writer process; the in-process
// writer holds the lockfile during write, so the snapshot read here is either
// the pre-write or post-write JSON. Best-effort: any transient parse error
// returns 0 (the next call will see a clean snapshot).
async function peekLength() {
  ensureQueueFile();
  try {
    const raw  = fs.readFileSync(QUEUE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    log.info('Queue', `Queue Peek → Snapshot unavailable → ${err.message}`);
    return 0;
  }
}

module.exports = { enqueue, enqueueMany, peekLength, drainQueue, getQueue, identityKey, markSweepCycle };

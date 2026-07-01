'use strict';
const fs        = require('fs');
const lockfile  = require('proper-lockfile');
const config    = require('./config');
const log       = require('./logger');

const QUEUE_FILE = config.queueFile;

function ensureQueueFile() {
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, '[]', 'utf8');
    log.info('Queue', 'Queue Initialization → Success → Empty array created');
  }
}

async function getQueue() {
  ensureQueueFile();
  let release;
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    log.error('Queue', `Queue Read → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
}

function identityKey(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.source === 'sonarr' && item.seriesId != null) {
    if (item.episodeId != null) return `sonarr:${item.seriesId}:eid:${item.episodeId}`;
    if (item.seasonNumber != null && item.episodeNumber != null) {
      return `sonarr:${item.seriesId}:s${item.seasonNumber}e${item.episodeNumber}`;
    }
    return null;
  }
  if (item.source === 'radarr' && item.movieId != null) {
    return `radarr:${item.movieId}`;
  }
  return null;
}

async function enqueue(item) {
  ensureQueueFile();
  let release;
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const raw  = fs.readFileSync(QUEUE_FILE, 'utf8');
    const data = JSON.parse(raw);
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
    }
    data.push(item);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
    log.info('Queue', `Queue Append → Success → Source: [${source}] | Trace: [${trace}] | Queue Length: ${data.length}`);
    return true;
  } catch (err) {
    log.error('Queue', `Queue Append → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
}

async function drainQueue() {
  ensureQueueFile();
  let release;
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const raw   = fs.readFileSync(QUEUE_FILE, 'utf8');
    const items = JSON.parse(raw);
    fs.writeFileSync(QUEUE_FILE, '[]', 'utf8');
    log.info('Queue', `Queue Drain → Success → Drained [${items.length}] item(s)`);
    return items;
  } catch (err) {
    log.error('Queue', `Queue Drain → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
}

// ── BLR-1 / DEC-BLR-4: bulk-insert (single lock per webhook). ────────────
// Sonarr season packs hit this path with up to ~30 items in one call; the
// per-batch overflow eviction (single phase) replaces N interleaved evictions.
async function enqueueMany(items) {
  if (!Array.isArray(items) || items.length === 0) return 0;
  ensureQueueFile();
  let release;
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const raw  = fs.readFileSync(QUEUE_FILE, 'utf8');
    const data = JSON.parse(raw);
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
    while (data.length > maxItems) {
      const dropped = data.shift();
      const droppedSource = (dropped && dropped.source) || 'unknown';
      const droppedTrace  = (dropped && dropped.traceId) || '-';
      log.audit('Queue', `Queue Overflow \u2192 Dropped oldest \u2192 Source: [${droppedSource}] | Trace: [${droppedTrace}] \u2192 Queue Length capped at ${maxItems}`);
    }
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
    const firstSource = additions[0].source || 'unknown';
    const firstTrace  = additions[0].traceId || '-';
    log.info('Queue', `Queue Append (Batch) → Success → Source: [${firstSource}] | Trace: [${firstTrace}] | Added: ${additions.length} | Queue Length: ${data.length}`);
    return additions.length;
  } catch (err) {
    log.error('Queue', `Queue Append (Batch) → Error → ${err.message}`);
    throw err;
  } finally {
    if (release) await release();
  }
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

module.exports = { enqueue, enqueueMany, peekLength, drainQueue, getQueue, identityKey };

'use strict';

// Reconciliation engine: catches imports that landed in Sonarr/Radarr while
// Telgrarr was OFF and re-injects them as canonical queue items, idempotent
// against the sentKeys ledger (C-LEDGER / WR-3) and bounded by CAP_PER_RUN
// (WR-5, lossless — remainder drains next tick). Roadmap STEP 2.3.

const crypto         = require('crypto');
const axios          = require('axios');
const config         = require('../config');
const log            = require('../logger');
const events         = require('../events');
const EVENT_TYPES    = require('../../shared/events.json');
const queue          = require('../queue');
const blacklist      = require('../blacklist');
const reconcileState = require('../reconcile-state');

// ─── Tuning consts (Roadmap WR-7) — code-level, NOT schema; promotion to schema
// is a future option, out of scope here. The single "tuning surface" for the
// reconciler. LEDGER_SIZE is owned by reconcile-state.js (cycle-avoidance,
// SRP) and re-exported here.
const INTERVAL_MS         = 3_600_000;        // hourly (O-1)
const CAP_PER_RUN         = 25;               // WR-5
const SAFETY_MARGIN_MS    = 5 * 60 * 1000;    // loose bound (C-SINCE); the
                                              // ledger is the dedup authority
const MAX_PAGES           = 10;               // 10 * PAGE_SIZE = 1000 records max/source/tick
const PAGE_SIZE           = 100;
const REQUEST_TIMEOUT_MS  = 15000;

// History API import-event names per source. Server-side filtering of
// eventType is avoided (versions differ on string vs int and on filter
// support); filtering is done client-side against this set. Both products
// use 'downloadFolderImported'; Radarr also emits 'movieFileImported' in
// newer versions for individual file imports.
const IMPORT_EVENT_TYPES = {
  sonarr: new Set(['downloadFolderImported']),
  radarr: new Set(['downloadFolderImported', 'movieFileImported']),
};

function newTraceId() {
  return `recon-${crypto.randomBytes(4).toString('hex')}`;
}

// Build the canonical sonarr queue item — shape matches the live webhook so
// `queue.identityKey` produces the same key the live path produces (C-IDENTITY).
function buildSonarrItem(record, nowMs) {
  if (!record || record.seriesId == null) return null;
  const episodeId     = record.episodeId;
  const seasonNumber  = record.episode && record.episode.seasonNumber;
  const episodeNumber = record.episode && record.episode.episodeNumber;
  // identityKey needs at least episodeId OR (season+episode)
  if (episodeId == null && (seasonNumber == null || episodeNumber == null)) return null;

  const item = {
    source: 'sonarr',
    traceId: newTraceId(),
    seriesId: record.seriesId,
    _receivedAt: new Date(nowMs).toISOString(),
    _viaReconcile: true,
  };
  if (episodeId     != null) item.episodeId     = episodeId;
  if (seasonNumber  != null) item.seasonNumber  = seasonNumber;
  if (episodeNumber != null) item.episodeNumber = episodeNumber;
  return item;
}

function buildRadarrItem(record, nowMs) {
  if (!record || record.movieId == null) return null;
  return {
    source: 'radarr',
    traceId: newTraceId(),
    movieId: record.movieId,
    _receivedAt: new Date(nowMs).toISOString(),
    _viaReconcile: true,
  };
}

function getRecordTitleId(source, record) {
  if (source === 'sonarr') return record.seriesId;
  if (source === 'radarr') return record.movieId;
  return null;
}

function getRecordPath(source, record) {
  if (source === 'sonarr') return (record.series && record.series.path) || null;
  if (source === 'radarr') return (record.movie  && record.movie.path)  || null;
  return null;
}

function buildHistoryUrl(source, baseUrl, page) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const includes = source === 'sonarr'
    ? 'includeEpisode=true&includeSeries=true'
    : 'includeMovie=true';
  return `${base}/api/v3/history?page=${page}&pageSize=${PAGE_SIZE}&sortKey=date&sortDirection=descending&${includes}`;
}

async function fetchHistoryPage(source, cfg, page) {
  const url = buildHistoryUrl(source, cfg.baseUrl, page);
  const res = await axios.get(url, {
    headers: { 'X-Api-Key': cfg.apiKey },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return (res && res.data && Array.isArray(res.data.records)) ? res.data.records : [];
}

// Walk history pages descending until we cross `fetchSinceMs` or hit MAX_PAGES.
// Returns ALL eligible import records newer than the cutoff (unsorted by id).
async function fetchImportHistorySince(source, cfg, fetchSinceMs) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const records = await fetchHistoryPage(source, cfg, page);
    if (records.length === 0) break;
    let oldestDateMs = Infinity;
    for (const r of records) {
      const dateMs = Date.parse(r.date || '');
      if (Number.isFinite(dateMs)) {
        if (dateMs < oldestDateMs) oldestDateMs = dateMs;
        if (dateMs < fetchSinceMs) continue;
      }
      if (!IMPORT_EVENT_TYPES[source].has(r.eventType)) continue;
      out.push(r);
    }
    if (Number.isFinite(oldestDateMs) && oldestDateMs < fetchSinceMs) break;
    if (records.length < PAGE_SIZE) break;
  }
  return out;
}


async function reconcileSource(source, nowMs) {
  const cfg = config[source];
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    log.warn('Reconcile', `${source} → Skipped → not configured`);
    return 0;
  }

  const state = reconcileState.getState();
  const sinceStr = (state && state[source] && state[source].since) || null;

  // First-run seed: set since to newest import time, enqueue nothing (WR-4).
  if (sinceStr === null) {
    const records = await fetchHistoryPage(source, cfg, 1);
    const imports = records.filter(r => IMPORT_EVENT_TYPES[source].has(r.eventType));
    const seed = (imports.length > 0 ? imports[0].date : null) || new Date(nowMs).toISOString();
    // Pre-populate ledger so existing imports are never re-announced (safety-margin window)
    const buildFn = source === 'sonarr' ? buildSonarrItem : buildRadarrItem;
    const seedKeys = [];
    for (const rec of imports) {
      const item = buildFn(rec, nowMs);
      if (item) { const k = queue.identityKey(item); if (k) seedKeys.push(k); }
    }
    if (seedKeys.length > 0) reconcileState.recordSent(source, seedKeys);
    reconcileState.setSince(source, seed);
    log.info('Reconcile', `${source} → Seeded → since=${seed} (first run, pre-populated ${seedKeys.length} ledger key(s))`);
    return 0;
  }

  const sinceMs = Date.parse(sinceStr);
  const fetchSinceMs = Number.isFinite(sinceMs) ? Math.max(0, sinceMs - SAFETY_MARGIN_MS) : 0;
  const records = await fetchImportHistorySince(source, cfg, fetchSinceMs);

  if (records.length === 0) {
    log.info('Reconcile', `${source} → No new imports`);
    return 0;
  }

  // Ledger dedup + blacklist gate (F-6).
  const eligible = [];
  for (const r of records) {
    const item = source === 'sonarr' ? buildSonarrItem(r, nowMs) : buildRadarrItem(r, nowMs);
    if (!item) continue;
    const idKey = queue.identityKey(item);
    if (!idKey) continue;

    if (reconcileState.isSent(source, idKey)) continue;

    const titleId = getRecordTitleId(source, r);
    if (titleId != null && blacklist.isIdBlacklisted(source, titleId)) {
      log.info('Reconcile', `${source} → Skipped (blacklist id) → ${idKey}`);
      continue;
    }
    const path = getRecordPath(source, r);
    if (path && blacklist.isPathBlacklisted(source, path)) {
      log.info('Reconcile', `${source} → Skipped (blacklist path) → ${idKey}`);
      continue;
    }

    eligible.push({ record: r, item });
  }

  // Sort ascending by record id (oldest first) and cap to CAP_PER_RUN (WR-5).
  eligible.sort((a, b) => (a.record.id || 0) - (b.record.id || 0));
  const taken = eligible.slice(0, CAP_PER_RUN);

  let enqueuedCount = 0;
  let newestTakenDate = sinceStr;
  for (const { record, item } of taken) {
    try {
      const wasAdded = await queue.enqueue(item);
      if (wasAdded) {
        const idKey = queue.identityKey(item);
          // FA-37: emitThrottled (not plain emit) for symmetry with the BLR SD-4
          // webhook sites -- a post-downtime boot reconcile can enqueue up to
          // 50 items (25 x 2 sources), enough to wipe the 50-slot SSE ring.
          events.emitThrottled(EVENT_TYPES.QUEUE_ITEM_ADDED, {
            level: 'info',
            module: 'Reconcile',
            message: `${source} → Enqueued (reconcile) → ${idKey}`,
            data: { source: item.source, traceId: item.traceId, viaReconcile: true, idKey },
          });
        enqueuedCount += 1;
        log.info('Reconcile', `${source} → Enqueued → ${idKey}`);
      }
      if (record.date && (!newestTakenDate || record.date > newestTakenDate)) {
        newestTakenDate = record.date;
      }
    } catch (err) {
      log.error('Reconcile', `${source} → Enqueue failed → ${err.message}`);
      // Do NOT advance newestTakenDate for failed enqueues — re-attempt next tick.
    }
  }

  // Advance since to the newest TAKEN date (NOT eligible's max — that would
  // skip the remainder past CAP_PER_RUN, which is supposed to drain next tick).
  if (newestTakenDate && newestTakenDate !== sinceStr) {
    reconcileState.setSince(source, newestTakenDate);
  }

  log.info(
    'Reconcile',
    `${source} → Done → enqueued=${enqueuedCount} eligible=${eligible.length} (cap=${CAP_PER_RUN})`
  );
  return enqueuedCount;
}

// reconcile() — public entry. Returns { enqueued } so the boot/tick wiring
// (STEP 3.1) can decide whether to scheduleSweep(). Per-source fail-soft
// (WR-13 / C-FAILSOFT): one *arr down never aborts the other or boot.
async function reconcile(opts = {}) {
  const nowMs = (opts && typeof opts.now === 'number') ? opts.now : Date.now();
  log.info('Reconcile', 'Reconcile → Starting');
  let total = 0;
  for (const source of ['sonarr', 'radarr']) {
    try {
      total += await reconcileSource(source, nowMs);
    } catch (err) {
      log.error('Reconcile', `${source} → Failed → ${err.message}`);
    }
  }
  log.info('Reconcile', `Reconcile → Complete → Enqueued [${total}]`);
  return { enqueued: total };
}

module.exports = {
  reconcile,
  // Tuning consts (Roadmap WR-7) — code-level surface, not schema.
  INTERVAL_MS,
  CAP_PER_RUN,
  SAFETY_MARGIN_MS,
  MAX_PAGES,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
  LEDGER_SIZE: reconcileState.LEDGER_SIZE,
};

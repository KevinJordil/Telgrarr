'use strict';
const fs          = require('fs');
const path        = require('path');
const lockfile    = require('proper-lockfile');
const writeAtomic = require('write-file-atomic');
const log         = require('./logger');
const config      = require('./config');

const historyFile = path.join(config.DATA_DIR, 'history.json');

// ── In-memory store ───────────────────────────────────────────────────────────
let _history = [];

// ── Boot: ensure file exists and load into memory ─────────────────────────────
(function _boot() {
  if (!fs.existsSync(historyFile)) {
    try {
      writeAtomic.sync(historyFile, JSON.stringify([], null, 2));
    } catch (err) {
      log.error('History', `Boot → Failed to create history.json → ${err.message}`);
    }
    return; // _history stays []
  }
  try {
    _history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch (err) {
    log.error('History', `Boot → Failed to read history.json → ${err.message}`);
    _history = [];
  }
}());

// ── Migration-on-read: one-time id assignment for legacy entries ──────────────
// Entries written before the HIST mission lacked an id field. Assign one now,
// re-save atomically (sync: boot is single-thread; no lockfile needed here).
(function _migrateIds() {
  if (!_history.some(e => !e.id)) return;
  const ts = Date.now();
  _history = _history.map((e, i) =>
    e.id
      ? e
      : { ...e, id: `${e.type || 'media'}-${ts}-${Math.random().toString(36).slice(2, 8)}-${i}` }
  );
  try {
    writeAtomic.sync(historyFile, JSON.stringify(_history, null, 2));
    log.info('History', `Migration → Assigned ids to legacy entries → total ${_history.length}`);
  } catch (err) {
    log.error('History', `Migration → Failed to persist id assignment → ${err.message}`);
  }
}());

// ── Internal: lockfile-guarded atomic flush ───────────────────────────────────
async function _flush() {
  const release = await lockfile.lock(historyFile, { retries: 5 });
  try {
    await new Promise((resolve, reject) => {
      writeAtomic(historyFile, JSON.stringify(_history, null, 2), err => {
        if (err) reject(err); else resolve();
      });
    });
  } finally {
    await release();
  }
}

// ── addHistory ────────────────────────────────────────────────────────────────
// Prepends new dispatch snapshot items; enforces the configured retention cap.
// Signature preserved: addHistory(newItems[]) — called by sweeper.js.
async function addHistory(newItems) {
  if (!newItems || newItems.length === 0) return;
  const cap = config.history.maxItems;
  _history = [...newItems, ..._history].slice(0, cap);
  try {
    await _flush();
    log.info('History', `Add → Flushed ${newItems.length} item(s) → total ${_history.length}`);
  } catch (err) {
    log.error('History', `Add → Failed to persist → ${err.message}`);
  }
}

// ── getHistory ────────────────────────────────────────────────────────────────
// Backward-compatible: returns the full in-memory array.
function getHistory() {
  return _history;
}

// ── getById ───────────────────────────────────────────────────────────────────
function getById(id) {
  return _history.find(e => e.id === id) || null;
}

// ── getAll ────────────────────────────────────────────────────────────────────
// Paginated, filtered, sorted query. Returns { items, total, page, pageSize }.
// Filtering and sorting are in-memory (context-fit: ≤10k entries, single-user).
function getAll({ type, search, sort = 'newest', page = 1, pageSize = 24 } = {}) {
  let items = _history.slice();

  if (type === 'show' || type === 'movie') {
    items = items.filter(e => e.type === type);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(e => e.title && e.title.toLowerCase().includes(q));
  }

  switch (sort) {
    case 'oldest':
      items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      break;
    case 'title-asc':
      items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
    case 'title-desc':
      items.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      break;
    case 'newest':
    default:
      items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      break;
  }

  const total = items.length;
  const ps    = Math.max(1, Math.min(100, Number(pageSize) || 24));
  const pg    = Math.max(1, Number(page) || 1);
  const start = (pg - 1) * ps;

  return { items: items.slice(start, start + ps), total, page: pg, pageSize: ps };
}

// ── removeById ────────────────────────────────────────────────────────────────
// Returns true if found and removed; false if not found. Route logs audit.
async function removeById(id) {
  const idx = _history.findIndex(e => e.id === id);
  if (idx === -1) return false;
  _history.splice(idx, 1);
  try {
    await _flush();
  } catch (err) {
    log.error('History', `Remove → Failed to persist → id=${id} → ${err.message}`);
  }
  return true;
}

// ── clear ─────────────────────────────────────────────────────────────────────
// Removes all entries. Returns the count removed. Route logs audit.
async function clear() {
  const count = _history.length;
  _history = [];
  try {
    await _flush();
  } catch (err) {
    log.error('History', `Clear → Failed to persist → ${err.message}`);
  }
  return count;
}

// ── pruneByAge ────────────────────────────────────────────────────────────────
// Removes entries older than maxAgeDays. 0 or negative = strict no-op.
// Entries with no timestamp are kept (malformed-entry guard).
// Returns count pruned. Caller (sweeper) logs.
async function pruneByAge(maxAgeDays) {
  if (!maxAgeDays || maxAgeDays <= 0) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const before = _history.length;
  _history = _history.filter(e => !e.timestamp || new Date(e.timestamp) > cutoff);
  const pruned = before - _history.length;
  if (pruned > 0) {
    try {
      await _flush();
    } catch (err) {
      log.error('History', `Prune → Failed to persist → ${err.message}`);
    }
  }
  return pruned;
}

// ── stats ─────────────────────────────────────────────────────────────────────
// Lightweight summary; pure read — no I/O.
function stats() {
  const byType = { show: 0, movie: 0 };
  let oldest = null;
  let newest = null;
  for (const e of _history) {
    if (e.type === 'show')       byType.show++;
    else if (e.type === 'movie') byType.movie++;
    if (e.timestamp) {
      if (!oldest || e.timestamp < oldest) oldest = e.timestamp;
      if (!newest || e.timestamp > newest) newest = e.timestamp;
    }
  }
  return { total: _history.length, byType, oldest, newest };
}

module.exports = {
  addHistory, getHistory,
  getById, getAll,
  removeById, clear, pruneByAge,
  stats,
};

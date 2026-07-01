'use strict';
const { EventEmitter } = require('events');
const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');
const EVENT_TYPES     = require('../shared/events.json');
const VALID_EVENTS    = Object.values(EVENT_TYPES);

// LOGGING CONSTRAINT (R11 divergence — Master §7): this module logs via console.*
// deliberately. logger.js requires events.js (it mirrors each log line into the SSE
// event ring), so events.js must NOT require logger — that would re-form a
// logger->events->logger cycle, and a logging failure could then recurse.
// console is the only safe sink at this layer. Sibling to RD-11/RD-12.

// FU-7: env-direct (NOT config.DATA_DIR). events.js loads within the
// config->logger->events chain; requiring config here would re-form the RD-11
// cycle. process.env.DATA_DIR resolves to the same value as config.DATA_DIR.
const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '../data');
const EVENTS_FILE = path.join(DATA_DIR, 'events-ring.json');

const bus = new EventEmitter();
bus.setMaxListeners(20);

const recentEvents = [];
let _seq = 0;

function loadEvents() {
  try {
    if (!fs.existsSync(EVENTS_FILE)) return;
    const raw    = fs.readFileSync(EVENTS_FILE, 'utf8');
    const loaded = JSON.parse(raw);
    if (Array.isArray(loaded) && loaded.length > 0) {
      recentEvents.push(...loaded);
      _seq = parseInt(recentEvents[recentEvents.length - 1].id.split('-')[1]) || 0;
    }
  } catch (err) {
    console.error('[Events] Ring Buffer Load → Error →', err.message);
  }
}

async function flushEvents() {
  try {
    await new Promise((resolve, reject) => {
      writeFileAtomic(
        EVENTS_FILE,
        JSON.stringify(recentEvents.slice(-50), null, 2),
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  } catch (err) {
    console.error('[Events] Ring Buffer Flush → Error →', err.message);
  }
}

function emit(type, level, module, message, data = {}) {
  if (!VALID_EVENTS.includes(type)) {
    console.warn(`[Events] Unknown event type emitted: ${type}`);
  }
  const event = {
    id:        `${Date.now()}-${++_seq}`,
    type,
    level,
    module,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
  recentEvents.push(event);
  if (recentEvents.length > 50) recentEvents.shift();
  bus.emit('event', event);
  return event;
}

function getRecentEvents(limit = 15) {
  return recentEvents.slice(-limit);
}

const THROTTLE_DEFAULT_MS = 1000; // R13 default -- DEC-BLR-15 (Phase 4 burst-coalescing window)
const _throttleState = new Map(); // type -> { timer, count, level, module, message, data } -- DEC-BLR-16

// BLR Phase 4 (DEC-BLR-16): leading-edge emit immediately on the first call for a
// given `type`; repeat calls within `windowMs` are coalesced into ONE trailing
// rollup event (data.count, data.coalesced=true) instead of flooding the SSE
// ring under burst load. A lone call with no repeats never gets a redundant
// trailing event. Process-memory only, per-type independent state (sibling
// class to translator-cooldown.js).
function emitThrottled(type, payload = {}, windowMs = THROTTLE_DEFAULT_MS) {
  const { level = 'info', module: moduleName = 'Events', message = type, data = {} } = payload;
  const existing = _throttleState.get(type);
  if (!existing) {
    const emitted = emit(type, level, moduleName, message, data);
    const timer = setTimeout(() => {
      const state = _throttleState.get(type);
      _throttleState.delete(type);
      if (state && state.count > 1) {
        emit(type, state.level, state.module, state.message, { ...state.data, coalesced: true, count: state.count });
      }
    }, windowMs);
    if (typeof timer.unref === 'function') timer.unref();
    _throttleState.set(type, { timer, count: 1, level, module: moduleName, message, data });
    return emitted;
  }
  existing.count += 1;
  existing.data = data;
  existing.level = level;
  existing.module = moduleName;
  existing.message = message;
  return null;
}

module.exports = { bus, emit, emitThrottled, getRecentEvents, loadEvents, flushEvents };

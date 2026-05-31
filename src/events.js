'use strict';
const { EventEmitter } = require('events');
const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');
const EVENT_TYPES     = require('../gui/src/shared/events.json');
const VALID_EVENTS    = Object.values(EVENT_TYPES);

const EVENTS_FILE = path.join(__dirname, '../data/events-ring.json');

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

module.exports = { bus, emit, getRecentEvents, loadEvents, flushEvents };

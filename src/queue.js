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
    return [];
  } finally {
    if (release) await release();
  }
}

async function enqueue(item) {
  ensureQueueFile();
  let release;
  try {
    release = await lockfile.lock(QUEUE_FILE, { retries: { retries: 10, minTimeout: 50 } });
    const raw  = fs.readFileSync(QUEUE_FILE, 'utf8');
    const data = JSON.parse(raw);
    data.push(item);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
    const source = item.source || 'unknown';
    log.info('Queue', `Queue Append → Success → Source: [${source}] | Queue Length: ${data.length}`);
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

module.exports = { enqueue, drainQueue, getQueue };

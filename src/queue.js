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

module.exports = { enqueue, drainQueue, getQueue };

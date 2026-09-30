'use strict';
const fs = require('fs');
const path = require('path');
const writeAtomic = require('write-file-atomic');
const config = require('../config');
const { eventKey } = require('./model');
const FILE = path.join(config.DATA_DIR, 'notifications.json');
const RETENTION_MS = 90 * 86400000;
let serial = Promise.resolve();
function read() {
  if (!fs.existsSync(FILE)) return { version: 1, jobs: [], sent: {} };
  const state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (state.version !== 1 || !Array.isArray(state.jobs) || !state.sent || typeof state.sent !== 'object' || Array.isArray(state.sent)) {
    throw new Error('Invalid notifications store; restore a backup before continuing');
  }
  return state;
}
function update(fn) {
  const operation = serial.then(async () => {
    const state = read();
    const value = fn(state);
    await writeAtomic(FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
    return value;
  });
  serial = operation.catch(() => {});
  return operation;
}
async function enqueue(event) {
  return update(state => {
    const now = Date.now();
    state.sent = Object.fromEntries(Object.entries(state.sent).filter(([, time]) => now - time < RETENTION_MS).slice(-10000));
    const key = eventKey(event);
    if (state.sent[key] || state.jobs.some(job => job.key === key)) return { accepted: false, duplicate: true };
    if (state.jobs.length >= config.queue.maxItems) {
      const error = new Error('Notification queue is full');
      error.status = 503;
      throw error;
    }
    state.jobs.push({ key, event, status: 'pending', attempts: 0, createdAt: new Date().toISOString(), nextAttemptAt: now });
    return { accepted: true, duplicate: false };
  });
}
function requestCursor() {
  return read().requestCursor ?? null;
}
async function setRequestCursor(cursor) {
  return update(state => { state.requestCursor = cursor; });
}
function nextJob() {
  return read().jobs.find(job => job.status === 'pending' && job.nextAttemptAt <= Date.now());
}
async function discard(key) {
  return update(state => { state.jobs = state.jobs.filter(job => job.key !== key); });
}
async function delivered(key) {
  return update(state => {
    state.jobs = state.jobs.filter(job => job.key !== key);
    state.sent[key] = Date.now();
    state.sent = Object.fromEntries(Object.entries(state.sent).slice(-10000));
  });
}
async function failed(key, retryable) {
  return update(state => {
    const job = state.jobs.find(job => job.key === key);
    if (!job) return;
    job.attempts++;
    job.status = retryable ? 'pending' : 'blocked';
    job.lastError = retryable ? 'Delivery unavailable; automatic retry scheduled' : 'Delivery rejected; check settings and retry';
    job.nextAttemptAt = Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts - 1, 7));
  });
}
async function retryBlocked() {
  return update(state => {
    let count = 0;
    for (const job of state.jobs) {
      if (job.status !== 'blocked') continue;
      job.status = 'pending'; job.nextAttemptAt = Date.now(); count++;
    }
    return count;
  });
}
function status() {
  const state = read();
  return {
    pending: state.jobs.filter(job => job.status === 'pending').length,
    blocked: state.jobs.filter(job => job.status === 'blocked').length,
    sent: Object.keys(state.sent).length,
    jobs: state.jobs.map(({ key, status: jobStatus, attempts, createdAt, lastError }) => ({ key, status: jobStatus, attempts, createdAt, lastError })),
  };
}
module.exports = { requestCursor, setRequestCursor, enqueue, nextJob, discard, delivered, failed, retryBlocked, status };

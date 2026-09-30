'use strict';
const config = require('../config');
const log = require('../logger');
const telegram = require('../telegram');
const history = require('../history');
const store = require('./store');
const poller = require('./seerr-poller');
const { enrich } = require('./enrichment');
const { render, viewData } = require('./model');
let running = null;
let timer = null;
let nextSendAt = 0;
let stopping = false;
let nextPollAt = 0;
async function processNext() {
  if (stopping || !config.notifications?.enabled) return;
  if (config.notifications.requestSource === 'poll' && Date.now() >= nextPollAt) {
    nextPollAt = Date.now() + poller.INTERVAL_MS;
    try { await poller.poll(); }
    catch { log.warn('Notifications', 'Seerr request polling unavailable; retrying on the next cycle'); }
  }
  if (Date.now() < nextSendAt) return;
  const job = store.nextJob();
  if (!job) return;
  let sent = false;
  try {
    const event = await enrich(job.event);
    if (event.suppressed) {
      await store.discard(job.key);
      log.info('Notifications', 'Availability skipped by the configured blacklist');
      return;
    }
    let caption;
    try { caption = render(event, config); }
    catch (error) { error.retryable = false; throw error; }
    let posterUrl = event.posterUrl;
    if (posterUrl) {
      try { caption = render(event, config, 1024); }
      catch { posterUrl = ''; }
    }
    await telegram.sendNotification(caption, posterUrl);
    sent = true;
    await store.delivered(job.key);
    nextSendAt = Date.now() + Math.max(5000, config.telegram.delayMs);
    const data = viewData(event, config);
    await history.addHistory([{
      id: job.key, type: event.mediaType === 'movie' ? 'movie' : 'show',
      title: data.title, year: event.year, timestamp: new Date().toISOString(),
      details: event.event === 'request' ? 'Nouvelle demande' : 'Disponible sur Plex',
      overview: data.overview, quality: data.quality, origin: data.origin,
      caption, posterUrl, imdbRating: event.imdbRating, event: event.event, tmdbId: event.tmdbId, enrichmentNotes: event.enrichmentNotes,
    }]);
    log.info('Notifications', `Delivered ${job.event.event}`);
  } catch (error) {
    // Transport errors may contain credentials or URLs. Store only a generic failure reason.
    log.warn('Notifications', sent ? 'Delivery succeeded but persistence failed; manual verification required' : 'Delivery failed; inspect notification status and service settings');
    await store.failed(job.key, !sent && error.retryable !== false);
    nextSendAt = Date.now() + Math.max(5000, error.retryAfterMs || config.telegram.delayMs);
  }
}
function tick() {
  if (running) return running;
  running = processNext().catch(() => log.error('Notifications', 'Notification store unavailable; restore a valid backup'))
    .finally(() => { running = null; });
  return running;
}
function start() {
  if (timer) return;
  stopping = false;
  timer = setInterval(tick, 1000);
  timer.unref();
  tick();
}
async function stop() {
  stopping = true;
  clearInterval(timer); timer = null;
  if (running) await running;
}
module.exports = { start, stop, tick };

'use strict';
const fs          = require('fs');
const path        = require('path');
const writeAtomic = require('write-file-atomic');
const { drainQueue, enqueue } = require('./queue');
const { buildCaption, getPosterUrl: getShowPosterUrl } = require('./formatter');
const { buildMovieCaption, getPosterUrl: getMoviePosterUrl } = require('./radarr-formatter');
const { refreshLibrary } = require('./emby');
const { addHistory } = require('./history');
const { enrichRadarrMedia } = require('./services/media-enricher');
const { fetchSonarrMetadata, fetchRadarrMetadata } = require('./services/metadata');
const { dispatchBatch } = require('./services/notifications');
const templates = require('./templates');
const config    = require('./config');
const log       = require('./logger');
const events    = require('./events');
const EVENT_TYPES = require('../shared/events.json');
const SWEEP_STATE_FILE = path.join(config.DATA_DIR, 'sweep-state.json');

function tracesOf(items) {
  if (!Array.isArray(items)) return '-';
  const set = new Set();
  for (const i of items) { if (i && i.traceId) set.add(i.traceId); }
  return set.size === 0 ? '-' : Array.from(set).join(',');
}

let batchTimer    = null;
let batchExpiresAt = null;
let isSweeping    = false;
function scheduleSweep() {
  if (batchTimer !== null) return;
  const fireAt = Date.now() + config.batchWindowMs;
  batchExpiresAt = new Date(fireAt).toISOString();
  log.info('Sweeper', `Batch Timer → Started → Fires in ${config.batchWindowMs / 1000}s`);
  events.emit(
    EVENT_TYPES.QUEUE_TIMER_STARTED,
    'info',
    'Sweeper',
    `Batch timer started — fires in ${Math.round(config.batchWindowMs / 1000)}s`,
    { expiresAt: batchExpiresAt }
  );
  batchTimer = setTimeout(async () => {
    batchTimer = null;
    batchExpiresAt = null;
    await runSweep();
  }, config.batchWindowMs);
}
function getQueueState() {
  return {
    active:     batchTimer !== null,
    expiresAt:  batchExpiresAt,
    isSweeping,
  };
}
// ── GAP-6: Crash Recovery — called by index.js before GAP-1 timer ────────────
async function recoverCrashedSweep() {
  if (!fs.existsSync(SWEEP_STATE_FILE)) return false;
  try {
    const raw   = fs.readFileSync(SWEEP_STATE_FILE, 'utf8');
    const items = JSON.parse(raw);
    if (Array.isArray(items) && items.length > 0) {
      log.warn('Sweeper', `Crash Recovery → Found ${items.length} orphaned item(s) → Re-queuing`);
      for (const item of items) {
        await enqueue(item);
      }
    }
    fs.unlinkSync(SWEEP_STATE_FILE);
    return true;
  } catch (err) {
    log.error('Sweeper', `Crash Recovery → Error → ${err.message}`);
    return false;
  }
}
async function runSweep() {
  if (isSweeping) {
    log.warn('Sweeper', 'Sweep Execution → Rejected → Sweep already in progress');
    return;
  }
  isSweeping = true;
  let sentCount = 0;
  try {
    log.info('Sweeper', 'Sweep Execution → Started → Draining queue');
    let items;
    try {
      items = await drainQueue();
    } catch (err) {
      log.error('Sweeper', `Queue Drain → Error → ${err.message}`);
      events.emit(EVENT_TYPES.SWEEP_ERROR, 'error', 'Sweeper', `Failed to drain queue: ${err.message}`, {});
      return;
    }
    if (!items || items.length === 0) {
      log.info('Sweeper', 'Sweep Execution → Skipped → Queue empty');
      events.emit(EVENT_TYPES.QUEUE_DRAINED, 'info', 'Sweeper', 'Queue was empty — nothing to do.', { count: 0 });
      return;
    }
    // ── GAP-6: Write crash marker before processing ───────────────────────────
    try {
      await new Promise((resolve, reject) => {
        writeAtomic(SWEEP_STATE_FILE, JSON.stringify(items, null, 2), (err) => {
          if (err) reject(err); else resolve();
        });
      });
    } catch (err) {
      log.error('Sweeper', `Sweep State Marker → Write Error → ${err.message}`);
    }
    log.info('Sweeper', `Sweep Execution → Processing → Items: ${items.length}`);
    events.emit(
      EVENT_TYPES.SWEEP_STARTED,
      'info',
      'Sweeper',
      `Sweep started — processing ${items.length} item(s)`,
      { count: items.length }
    );
    const sonarrGroups = {};
    const radarrGroups = {};
    for (const item of items) {
      if (item.source === 'radarr') {
        const id = item.movieId;
        if (!id) continue;
        if (!radarrGroups[id]) radarrGroups[id] = [];
        radarrGroups[id].push(item);
        continue;
      }
      const id = item.seriesId;
      if (!id) continue;
      if (!sonarrGroups[id]) sonarrGroups[id] = [];
      sonarrGroups[id].push(item);
    }
    const messages     = [];
    const historyItems = [];
    for (const seriesId of Object.keys(sonarrGroups)) {
      const episodes = sonarrGroups[seriesId];
      const activeMode = templates.getActiveMode();
      let series, tmdbSeries, omdbData;
      try {
        ({ series, tmdbSeries, omdbData } = await fetchSonarrMetadata(seriesId, activeMode));
      } catch (err) {
        log.error('Sweeper', `Metadata Fetch (Sonarr) → Error → ID: ${seriesId} | Traces: [${tracesOf(episodes)}] | ${err.message}`);
        continue;
      }
      const caption  = await buildCaption(series, episodes, tmdbSeries, omdbData);
      const photoUrl = getShowPosterUrl(series);
      if (!photoUrl) {
        log.warn('Sweeper', `Message Prep (Sonarr) → Skipped → Missing poster for "${series.title}" | Traces: [${tracesOf(episodes)}]`);
        continue;
      }
      messages.push({ photoUrl, caption });
      historyItems.push({
        id:        `sonarr-${seriesId}-${Date.now()}`,
        title:     series.title,
        type:      'show',
        year:      series.year,
        poster:    photoUrl,
        details:   `${episodes.length} Episode${episodes.length > 1 ? 's' : ''}`,
        timestamp: new Date().toISOString(),
        traces:    tracesOf(episodes),
      });
      log.info('Sweeper', `Message Prep (Sonarr) → Success → "${series.title}" (${episodes.length} episode(s)) | Traces: [${tracesOf(episodes)}]`);
      events.emit(
        EVENT_TYPES.SWEEP_ITEM_READY,
        'info',
        'Sweeper',
        `📺 "${series.title}" ready — ${episodes.length} episode(s)`,
        { title: series.title, type: 'show' }
      );
    }
    for (const movieId of Object.keys(radarrGroups)) {
      const activeMode = templates.getActiveMode();
      let movie, tmdbMovie, omdbData;
      try {
        ({ movie, tmdbMovie, omdbData } = await fetchRadarrMetadata(movieId, activeMode));
      } catch (err) {
        log.error('Sweeper', `Metadata Fetch (Radarr) → Error → ID: ${movieId} | Traces: [${tracesOf(radarrGroups[movieId])}] | ${err.message}`);
        continue;
      }
      if (!movie) {
        log.warn('Sweeper', `Message Prep (Radarr) → Skipped → Metadata unavailable for ID: ${movieId} | Traces: [${tracesOf(radarrGroups[movieId])}]`);
        continue;
      }
      const enriched = await enrichRadarrMedia(movie, tmdbMovie, omdbData, activeMode);
      movie = enriched.movie;
      tmdbMovie = enriched.tmdbMovie;
      const ratings = enriched.ratings;
      if (tmdbMovie && tmdbMovie._overviewAr) tmdbMovie.overview = tmdbMovie._overviewAr;
      const { caption, pass, length } = buildMovieCaption(movie, tmdbMovie, ratings);
      const photoUrl = getMoviePosterUrl(movie);
      if (!photoUrl) {
        log.warn('Sweeper', `Message Prep (Radarr) → Skipped → Missing poster for "${movie.title}" | Traces: [${tracesOf(radarrGroups[movieId])}]`);
        continue;
      }
      messages.push({ photoUrl, caption });
      historyItems.push({
        id:        `radarr-${movieId}-${Date.now()}`,
        title:     movie.title,
        type:      'movie',
        year:      movie.year,
        poster:    photoUrl,
        details:   tmdbMovie?.runtime ? `${tmdbMovie.runtime} min` : 'Movie',
        timestamp: new Date().toISOString(),
        ratings: {
          imdb:           ratings.imdb           || null,
          tmdb:           ratings.tmdb           || null,
          rottenTomatoes: ratings.rottenTomatoes || null,
          metacritic:     ratings.metacritic     || null,
        },
        imdbId:   movie.imdbId  || null,
        tmdbId:   movie.tmdbId  || null,
        language: config.tmdb.language,
        traces:   tracesOf(radarrGroups[movieId]),
      });
      log.info('Sweeper', `Message Prep (Radarr) → Success → "${movie.title}" | Pass: ${pass} | Length: ${length} | Traces: [${tracesOf(radarrGroups[movieId])}]`);
      events.emit(
        EVENT_TYPES.SWEEP_ITEM_READY,
        'info',
        'Sweeper',
        `🎬 "${movie.title}" ready`,
        { title: movie.title, type: 'movie' }
      );
    }
    if (messages.length === 0) {
      log.warn('Sweeper', 'Sweep Execution → Skipped → No valid messages after processing');
      events.emit(EVENT_TYPES.SWEEP_ERROR, 'warn', 'Sweeper', 'No messages to send after processing.', {});
      return;
    }
    const sweepStart = Date.now();
    const { successful, failed } = await dispatchBatch(messages, historyItems);
    const ms = Date.now() - sweepStart;
    sentCount = successful.length;
    const errorCount = failed.length;
    for (const fail of failed) {
      log.error('Sweeper', `Telegram Dispatch → Error → "${fail.item.title}" | Traces: [${fail.item.traces || '-'}] | ${fail.error}`);
      events.emit(
        EVENT_TYPES.SWEEP_TG_ERROR,
        'error',
        'Sweeper',
        `❌     Failed to send "${fail.item.title}": ${fail.error}`,
        { title: fail.item.title }
      );
    }
    if (sentCount > 0) {
      log.info('Sweeper', `Telegram Dispatch → Complete → Sent: ${sentCount} | Failed: ${errorCount} | Duration: ${ms}ms`);
      events.emit(
        EVENT_TYPES.SWEEP_TG_SENT,
        'success',
        'Sweeper',
        `✅     ${sentCount} message(s) sent to Telegram`,
        { count: sentCount, errors: errorCount, durationMs: ms }
      );
      await addHistory(successful);
    }
    if (sentCount === 0 && errorCount > 0) {
      log.error('Sweeper', 'Sweep Execution → Aborted → All Telegram dispatches failed');
      return;
    }
    try {
      // F.10/O5: emit SWEEP_EMBY only when a refresh actually fired; an unconfigured
      // Emby skip returns false and must NOT surface a phantom success event.
      const embyRefreshed = await refreshLibrary();
      if (embyRefreshed) {
        events.emit(EVENT_TYPES.SWEEP_EMBY, 'info', 'Sweeper', '🔃 Emby library refresh triggered', {});
      }
    } catch (err) {
      log.error('Sweeper', `Library Refresh (Emby) → Error → ${err.message}`);
    }
    log.info('Sweeper', `Sweep Execution → Complete → Sent: ${sentCount} | Failed: ${errorCount}`);
    events.emit(
      EVENT_TYPES.SWEEP_COMPLETE,
      'success',
      'Sweeper',
      `Sweep complete — ${sentCount} sent`,
      { sent: sentCount, errors: errorCount }
    );
    events.emit(EVENT_TYPES.QUEUE_DRAINED, 'info', 'Sweeper', 'Queue drained.', { count: 0 });
  } finally {
    isSweeping = false;
    if (sentCount > 0 && fs.existsSync(SWEEP_STATE_FILE)) {
      try {
        fs.unlinkSync(SWEEP_STATE_FILE);
      } catch (err) {
        log.error('Sweeper', `Sweep State Marker → Cleanup Error → ${err.message}`);
      }
    }
  }
}
module.exports = { scheduleSweep, getQueueState, runSweep, recoverCrashedSweep };

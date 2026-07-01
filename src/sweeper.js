'use strict';
const fs          = require('fs');
const path        = require('path');
const writeAtomic = require('write-file-atomic');
const { drainQueue, enqueue, peekLength, identityKey } = require('./queue');
const { recordSent } = require('./reconcile-state');
const { buildCaption, getPosterUrl: getShowPosterUrl } = require('./formatter');
const { buildMovieCaption, getPosterUrl: getMoviePosterUrl } = require('./radarr-formatter');
const { refreshLibrary } = require('./emby');
const { addHistory, pruneByAge } = require('./history');
const { enrichSonarrMedia, enrichRadarrMedia } = require('./services/media-enricher');
const { resolveRating }      = require('./utils/media-utils');
const { fetchSonarrMetadata, fetchRadarrMetadata } = require('./services/metadata');
const { dispatchBatch } = require('./services/notifications');
const templates = require('./templates');
const config    = require('./config');
const log       = require('./logger');
const events    = require('./events');
const EVENT_TYPES = require('../shared/events.json');
const providerBreaker = require('./services/provider-breaker');
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
let pendingSweep  = false;           // BLR-1 / DEC-BLR-1: wake-after-finish
const SWEEP_NOW_THRESHOLD = 50;      // BLR-1 / DEC-BLR-3: depth trigger
async function scheduleSweep() {
  // Continuity guard (DEC-BLR-1): a sweep already in flight → mark the
  // wake-after-finish flag and return. runSweep's finally{} consumes it.
  if (isSweeping) { pendingSweep = true; return; }
  if (batchTimer !== null) return;
  // Depth trigger (DEC-BLR-3): if the queue is already tsunami-shaped, skip
  // the ${config.batchWindowMs/1000}s coalesce window and dispatch via
  // setImmediate (the calling webhook handler has already returned 200; this
  // lands on the next tick). peekLength is lock-free per DEC-BLR-2.
  let depth = 0;
  try { depth = await peekLength(); } catch (_) { /* lock-free; tolerate */ }
  // Re-check after the async hop (defence-in-depth — a runSweep may have
  // started, or another scheduleSweep may have armed the timer).
  if (isSweeping) { pendingSweep = true; return; }
  if (batchTimer !== null) return;
  if (depth >= SWEEP_NOW_THRESHOLD) {
    log.info('Sweeper', `Sweep Execution → Triggered (depth) → Queue Length: ${depth} ≥ ${SWEEP_NOW_THRESHOLD}`);
    setImmediate(() => {
      runSweep().catch((err) => log.error('Sweeper', `Sweep Immediate → Error → ${err.message}`));
    });
    return;
  }
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
  providerBreaker.reset();
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
    const messageMeta  = [];
    for (const seriesId of Object.keys(sonarrGroups)) {
      const episodes = sonarrGroups[seriesId];
      const activeMode = templates.getActiveMode();
      let series, tmdbSeries, omdbData;
      try {
        ({ series, tmdbSeries, omdbData } = await fetchSonarrMetadata(seriesId, activeMode, templates.isElementEnabled('sonarr', 'plot')));
      } catch (err) {
        log.error('Sweeper', `Metadata Fetch (Sonarr) → Error → ID: ${seriesId} | Traces: [${tracesOf(episodes)}] | ${err.message}`);
        continue;
      }
      // ── Enrich Sonarr series for history capture (HIST H1.3) ───────────────
      // enrichSonarrMedia is called here explicitly so enriched fields
      // (_overviewAr/_overviewEn, _genresAr/_genresEn) are available for the
      // dispatch snapshot. buildCaption calls enrichSonarrMedia internally too;
      // all translation/genre paths are cache-warm after the first call.
      const enrichedSeries = await enrichSonarrMedia(
        series, tmdbSeries, omdbData, activeMode,
        undefined,
        templates.isElementEnabled('sonarr', 'plot')
      );
      const caption  = await buildCaption(series, episodes, tmdbSeries, omdbData, activeMode);
      const photoUrl = getShowPosterUrl(series);
      if (!photoUrl) {
        log.warn('Sweeper', `Message Prep (Sonarr) \u2192 Skipped \u2192 Missing poster for "${series.title}" | Traces: [${tracesOf(episodes)}]`);
        continue;
      }
      // ── Sonarr ratings: OMDb + TMDb vote_average (HD-14A parity) ───────────
      const _sOmdbImdb = omdbData?.imdbRating ? parseFloat(omdbData.imdbRating) : 0;
      const _sRtRaw    = omdbData?.Ratings?.find(x => x.Source === 'Rotten Tomatoes')?.Value || '';
      const _sMcRaw    = omdbData?.Ratings?.find(x => x.Source === 'Metacritic')?.Value     || '';
      const _sOmdbRt   = _sRtRaw ? parseInt(_sRtRaw.replace('%', ''), 10) : 0;
      const _sOmdbMc   = _sMcRaw ? parseInt(_sMcRaw.split('/')[0],   10) : 0;
      const sonarrRatings = {
        imdb:           resolveRating(0, _sOmdbImdb, v => `${v}`),
        tmdb:           (tmdbSeries?.vote_average > 0) ? `${tmdbSeries.vote_average}` : null,
        rottenTomatoes: resolveRating(0, _sOmdbRt,   v => `${v}`),
        metacritic:     resolveRating(0, _sOmdbMc,   v => `${v}`),
      };
      // ── Sonarr quality — first non-null across the episode batch ───────────
      const sonarrQuality  = episodes.find(ep => ep.quality)?.quality || null;
      // ── Sonarr backdrop URL (TMDb CDN, nullable) ───────────────────────────
      const sonarrBackdrop = tmdbSeries?.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${tmdbSeries.backdrop_path}`
        : null;
      // ── Sonarr overview + genres — "what was sent" (HD-20) ────────────────
      const _sonarrEnMode  = activeMode === 'default_en';
      const sonarrOverview = _sonarrEnMode
        ? (enrichedSeries._overviewEn || null)
        : (enrichedSeries._overviewAr || enrichedSeries._overviewEn || null);
      const sonarrGenres   = _sonarrEnMode
        ? (enrichedSeries._genresEn   || null)
        : (enrichedSeries._genresAr   || enrichedSeries._genresEn   || null);
      messages.push({ photoUrl, caption });
      historyItems.push({
        id:          `sonarr-${seriesId}-${Date.now()}`,
        title:       series.title,
        type:        'show',
        year:        series.year,
        poster:      photoUrl,
        details:     `${episodes.length} Episode${episodes.length > 1 ? 's' : ''}`,
        timestamp:   new Date().toISOString(),
        traces:      tracesOf(episodes),
        ratings:     sonarrRatings,
        imdbId:      series.imdbId  || null,
        tmdbId:      series.tmdbId  || null,
        tvdbId:      series.tvdbId  || null,
        language:    config.translator?.targetLang || 'ar',
        overview:    sonarrOverview,
        genres:      sonarrGenres,
        runtime:     tmdbSeries?.episode_run_time?.[0] || null,
        quality:     sonarrQuality,
        backdropUrl: sonarrBackdrop,
        episodes:    episodes.map(ep => ({
          season:  ep.seasonNumber,
          episode: ep.episodeNumber,
          title:   ep.episodeTitle  || null,
        })),
        externalIds: {
          tmdbId: series.tmdbId  || null,
          imdbId: series.imdbId  || null,
          tvdbId: series.tvdbId  || null,
        },
      });
      messageMeta.push({ source: 'sonarr', identityKeys: episodes.map(identityKey).filter(Boolean) });
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
        ({ movie, tmdbMovie, omdbData } = await fetchRadarrMetadata(movieId, activeMode, templates.isElementEnabled('radarr', 'plot')));
      } catch (err) {
        log.error('Sweeper', `Metadata Fetch (Radarr) → Error → ID: ${movieId} | Traces: [${tracesOf(radarrGroups[movieId])}] | ${err.message}`);
        continue;
      }
      if (!movie) {
        log.warn('Sweeper', `Message Prep (Radarr) → Skipped → Metadata unavailable for ID: ${movieId} | Traces: [${tracesOf(radarrGroups[movieId])}]`);
        continue;
      }
      const enriched = await enrichRadarrMedia(movie, tmdbMovie, omdbData, activeMode, undefined, templates.isElementEnabled('radarr', 'plot'));
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
      // ── Radarr backdrop URL (TMDb CDN, nullable) ───────────────────────────
      const radarrBackdrop = tmdbMovie?.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}`
        : null;
      // ── Radarr quality — first non-null value in the movie group ──────────
      const radarrQuality  = radarrGroups[movieId].find(it => it.quality)?.quality || null;
      // ── Radarr overview + genres — "what was sent" (HD-20) ────────────────
      const _radarrEnMode  = activeMode === 'default_en';
      const radarrOverview = _radarrEnMode
        ? (tmdbMovie?._overviewEn || null)
        : (tmdbMovie?._overviewAr || tmdbMovie?._overviewEn || null);
      const radarrGenres   = _radarrEnMode
        ? (movie._genresEn || null)
        : (movie._genresAr || movie._genresEn || null);
      historyItems.push({
        id:          `radarr-${movieId}-${Date.now()}`,
        title:       movie.title,
        type:        'movie',
        year:        movie.year,
        poster:      photoUrl,
        details:     tmdbMovie?.runtime ? `${tmdbMovie.runtime} min` : 'Movie',
        timestamp:   new Date().toISOString(),
        ratings: {
          imdb:           ratings.imdb           || null,
          tmdb:           ratings.tmdb           || null,
          rottenTomatoes: ratings.rottenTomatoes || null,
          metacritic:     ratings.metacritic     || null,
        },
        imdbId:      movie.imdbId  || null,
        tmdbId:      movie.tmdbId  || null,
        language:    config.translator?.targetLang || 'ar',
        traces:      tracesOf(radarrGroups[movieId]),
        overview:    radarrOverview,
        genres:      radarrGenres,
        runtime:     tmdbMovie?.runtime || null,
        quality:     radarrQuality,
        backdropUrl: radarrBackdrop,
        episodes:    null,
        externalIds: {
          tmdbId: movie.tmdbId  || null,
          imdbId: movie.imdbId  || null,
          tvdbId: null,
        },
      });
      messageMeta.push({ source: 'radarr', identityKeys: radarrGroups[movieId].map(identityKey).filter(Boolean) });
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
    const metaByItem = new Map();
    for (let mi = 0; mi < historyItems.length; mi++) {
      metaByItem.set(historyItems[mi], messageMeta[mi]);
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
      try {
        const sonarrKeys = [];
        const radarrKeys = [];
        for (const sentItem of successful) {
          const meta = metaByItem.get(sentItem);
          if (!meta) continue;
          if (meta.source === 'sonarr') { for (const k of meta.identityKeys) sonarrKeys.push(k); }
          else if (meta.source === 'radarr') { for (const k of meta.identityKeys) radarrKeys.push(k); }
        }
        if (sonarrKeys.length > 0) recordSent('sonarr', sonarrKeys);
        if (radarrKeys.length > 0) recordSent('radarr', radarrKeys);
      } catch (err) {
        log.error('Sweeper', 'Ledger Write \u2192 Error \u2192 ' + err.message);
      }
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
    // ── Age-based history retention — piggybacks on the sweep cycle (HIST H1.5) ──
    // pruneByAge(0) is a strict no-op per contract; safe when maxAgeDays unset.
    try {
      const _maxAge = config.history?.maxAgeDays;
      if (_maxAge > 0) {
        const _pruned = await pruneByAge(_maxAge);
        if (_pruned > 0) log.info('History', `Prune → Removed ${_pruned} entries older than ${_maxAge} days`);
      }
    } catch (_pruneErr) {
      log.error('History', `Prune → Error → ${_pruneErr.message}`);
    }
    if (sentCount > 0 && fs.existsSync(SWEEP_STATE_FILE)) {
      try {
        fs.unlinkSync(SWEEP_STATE_FILE);
      } catch (err) {
        log.error('Sweeper', `Sweep State Marker → Cleanup Error → ${err.message}`);
      }
    }
    // ── BLR-1 / DEC-BLR-1: Sweep continuity — wake-after-finish + tail-rearm
    // If a webhook arrived during this sweep, pendingSweep was set by
    // scheduleSweep; consume it and rearm. Otherwise, if items are queued
    // (e.g. an enqueue raced past drainQueue into finally), rearm anyway —
    // belt-and-braces against the C-2 stranding mode. The rearm is
    // intentionally fire-and-forget; .catch guards unhandled rejection.
    try {
      if (pendingSweep) {
        pendingSweep = false;
        scheduleSweep().catch((err) => log.error('Sweeper', `Sweep Rearm → Error → ${err.message}`));
      } else {
        const tail = await peekLength();
        if (tail > 0) {
          scheduleSweep().catch((err) => log.error('Sweeper', `Sweep Rearm → Error → ${err.message}`));
        }
      }
    } catch (err) {
      log.error('Sweeper', `Sweep Rearm → Error → ${err.message}`);
    }
  }
}
module.exports = { scheduleSweep, getQueueState, runSweep, recoverCrashedSweep };

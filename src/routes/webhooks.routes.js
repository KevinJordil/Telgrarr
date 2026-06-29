'use strict';
const express    = require('express');
const crypto     = require('crypto');
const router     = express.Router();
const log        = require('../logger');
const events     = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
const blacklist  = require('../blacklist');
const { enqueue } = require('../queue');
const { scheduleSweep } = require('../sweeper');
const config = require('../config');
const { tokenValid } = require('../auth/webhook-token');

// ── POST /sonarr ─────────────────────────────────────────────────────────────
// C.5 / S1 — closed-by-default webhook guard. Secret is the /hooks/<secret>/ path
// segment (RD-5 primary), constant-time compared. Unset WEBHOOK_SECRET => 401.
function webhookAuth(req, res, next) {
  if (tokenValid(req.params.token, config.WEBHOOK_SECRET)) return next();
  log.audit('Webhook', 'Authentication → Rejected → Missing or invalid secret');
  return res.status(401).json({ error: 'Unauthorized' });
}

router.post('/:token/sonarr', webhookAuth, async (req, res) => {
  res.sendStatus(200);
  const payload = req.body;
  const traceId = crypto.randomBytes(4).toString('hex');

  if (!payload || payload.eventType !== 'Download') {
    log.info('Webhook', `Webhook Event (Sonarr) → Ignored → EventType: [${payload?.eventType || 'unknown'}] | trace=${traceId}`);
    return;
  }

  const seriesId = payload.series?.id;
  const title = payload.series?.title || 'Unknown';
  const seriesPath = payload.series?.path || null;

  if (!seriesId) {
    log.warn('Webhook', `Webhook Event (Sonarr) → Skipped → Missing series.id | trace=${traceId}`);
    return;
  }

  if (blacklist.isIdBlacklisted('sonarr', seriesId)) {
    log.info('Webhook', `Webhook Event (Sonarr) → Blacklisted (ID) → Title: [${title}] | trace=${traceId}`);
    events.emit(EVENT_TYPES.BLACKLIST_ID_SKIPPED, 'info', 'Blacklist', `Skipped (blacklisted): "${title}"`, { type: 'sonarr', id: seriesId, title });
    return;
  }

  if (blacklist.isPathBlacklisted('sonarr', seriesPath)) {
    log.info('Webhook', `Webhook Event (Sonarr) → Blacklisted (Path) → Title: [${title}] | Path: [${seriesPath}] | trace=${traceId}`);
    events.emit(EVENT_TYPES.BLACKLIST_PATH_SKIPPED, 'info', 'Blacklist', `Skipped (path blocked): "${title}"`, { type: 'sonarr', path: seriesPath, title });
    return;
  }

  const episodes = payload.episodes || [];
  let queuedCount = 0;

  for (const episode of episodes) {
    try {
      const added = await enqueue({
        source: 'sonarr',
        traceId,
        seriesId,
        episodeId: episode.id,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        episodeTitle:  episode.title                                       || null,
        quality:       payload.episodeFile?.quality?.quality?.name || null,
        _receivedAt:   new Date().toISOString(),
      });
      if (added) {
        queuedCount++;
        log.info('Webhook', `Webhook Event (Sonarr) → Queued → Title: [${title}] S${episode.seasonNumber}E${episode.episodeNumber} | trace=${traceId}`);
      }
    } catch (err) {
      log.error('Webhook', `Webhook Event (Sonarr) → Error → Title: [${title}] S${episode.seasonNumber}E${episode.episodeNumber} | ${err.message} | trace=${traceId}`);
    }
  }

  if (queuedCount > 0) {
    events.emit(EVENT_TYPES.QUEUE_ITEM_ADDED, 'info', 'Listener', `"${title}" — ${queuedCount} episode(s) queued`, { title, type: 'sonarr', count: queuedCount });
    scheduleSweep();
    log.info('Webhook', `Webhook Batch (Sonarr) → Success → Title: [${title}] | Queued: ${queuedCount} episode(s) | trace=${traceId}`);
  }
});

// ── POST /radarr ─────────────────────────────────────────────────────────────
router.post('/:token/radarr', webhookAuth, async (req, res) => {
  res.sendStatus(200);
  const payload = req.body;
  const traceId = crypto.randomBytes(4).toString('hex');

  if (!payload || payload.eventType !== 'Download') {
    log.info('Webhook', `Webhook Event (Radarr) → Ignored → EventType: [${payload?.eventType || 'unknown'}] | trace=${traceId}`);
    return;
  }

  const movieId = payload.movie?.id;
  const title = payload.movie?.title || 'Unknown';
  const moviePath = payload.movie?.folderPath || null;

  if (!movieId) {
    log.warn('Webhook', `Webhook Event (Radarr) → Skipped → Missing movie.id | trace=${traceId}`);
    return;
  }

  if (blacklist.isIdBlacklisted('radarr', movieId)) {
    log.info('Webhook', `Webhook Event (Radarr) → Blacklisted (ID) → Title: [${title}] | trace=${traceId}`);
    events.emit(EVENT_TYPES.BLACKLIST_ID_SKIPPED, 'info', 'Blacklist', `Skipped (blacklisted): "${title}"`, { type: 'radarr', id: movieId, title });
    return;
  }

  if (blacklist.isPathBlacklisted('radarr', moviePath)) {
    log.info('Webhook', `Webhook Event (Radarr) → Blacklisted (Path) → Title: [${title}] | Path: [${moviePath}] | trace=${traceId}`);
    events.emit(EVENT_TYPES.BLACKLIST_PATH_SKIPPED, 'info', 'Blacklist', `Skipped (path blocked): "${title}"`, { type: 'radarr', path: moviePath, title });
    return;
  }

  try {
    const added = await enqueue({
      source: 'radarr',
      traceId,
      movieId,
      quality:     payload.movieFile?.quality?.quality?.name || null,
      _receivedAt: new Date().toISOString(),
    });
    if (added) {
      events.emit(EVENT_TYPES.QUEUE_ITEM_ADDED, 'info', 'Listener', `"${title}" queued`, { title, type: 'radarr', count: 1 });
      scheduleSweep();
      log.info('Webhook', `Webhook Event (Radarr) → Queued → Title: [${title}] | trace=${traceId}`);
    }
  } catch (err) {
    log.error('Webhook', `Webhook Event (Radarr) → Error → Title: [${title}] | ${err.message} | trace=${traceId}`);
  }
});

module.exports = router;

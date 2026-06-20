'use strict';

const express = require('express');
const router = express.Router();

const { renderSonarr, renderRadarr } = require('../template-engine');
const telegram = require('../telegram');
const { requireAuth } = require('../middlewares/auth');
const { MOCK_SONARR, MOCK_RADARR } = require('../mocks/media-mocks');
const { enrichSonarrMedia, enrichRadarrMedia } = require('../services/media-enricher');
const templates = require('../templates');
const config = require('../config');
const { resolveComposed } = require('../templates/layout-fragments');
const { LANGUAGE_NAME } = require('../languages');

const SONARR_POSTER = 'https://artworks.thetvdb.com/banners/posters/81189-22.jpg';
const RADARR_POSTER = 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg';

function buildPreviewRadarrMovie() {
  return {
    ...MOCK_RADARR.movie,
    ratings: {
      imdb: MOCK_RADARR.ratings?.imdb ? { value: parseFloat(MOCK_RADARR.ratings.imdb) } : null,
      tmdb: MOCK_RADARR.ratings?.tmdb ? { value: parseFloat(MOCK_RADARR.ratings.tmdb) } : null,
      rottenTomatoes: MOCK_RADARR.ratings?.rottenTomatoes
        ? { value: parseInt(MOCK_RADARR.ratings.rottenTomatoes.replace('%', ''), 10) }
        : null,
      metacritic: MOCK_RADARR.ratings?.metacritic
        ? { value: parseInt(MOCK_RADARR.ratings.metacritic.split('/')[0], 10) }
        : null,
    },
  };
}

// Preview render language: an explicit, validated request value (one of the supported
// languages) or the live translator target as default, so the default preview matches
// exactly what is dispatched live. ONE source of the language set (src/languages.js, R02).
function resolveLang(raw) {
  const fallback = config.translator?.targetLang || 'ar';
  return (typeof raw === 'string' && LANGUAGE_NAME[raw]) ? raw : fallback;
}

// Build a preview caption the SAME way the live formatters do (R02). Two paths:
//  - Advanced (raw `template` supplied): render it as-is with the live enrichment -
//    byte-identical to the legacy preview (the freeform escape hatch).
//  - Default styling (no template): compose the stored layout descriptor at the selected
//    language and enrich content at that language, so preview == live and never mixed.
async function renderPreview(body = {}) {
  const { type, scenario, template } = body;
  const advanced = typeof template === 'string' && template.length > 0;
  const lang = resolveLang(body.lang);
  const enrichMode = advanced ? templates.getActiveMode() : (lang === 'en' ? 'default_en' : 'default_ar');
  const langOverride = advanced ? undefined : lang;
  const opts = advanced ? undefined : { lang };

  if (type === 'sonarr') {
    const series = await enrichSonarrMedia(MOCK_SONARR.series, null, null, enrichMode, langOverride);
    const eps = MOCK_SONARR[scenario] || MOCK_SONARR.single;
    const tpl = advanced ? template : resolveComposed('sonarr', 'DEFAULT_AR', lang, templates.getLayout().sonarr).template;
    return { caption: renderSonarr(tpl, series, eps, opts), photoUrl: SONARR_POSTER };
  }

  const previewMovie = buildPreviewRadarrMovie();
  const { movie, tmdbMovie, ratings } = await enrichRadarrMedia(previewMovie, MOCK_RADARR.tmdb, null, enrichMode, langOverride);
  if (tmdbMovie && tmdbMovie._overviewAr) tmdbMovie.overview = tmdbMovie._overviewAr;
  const tpl = advanced ? template : resolveComposed('radarr', 'DEFAULT_AR', lang, templates.getLayout().radarr).template;
  return { caption: renderRadarr(tpl, movie, tmdbMovie, ratings, opts).caption, photoUrl: RADARR_POSTER };
}

router.post('/render', requireAuth, async (req, res) => {
  try {
    const { caption } = await renderPreview(req.body);
    res.json({ success: true, html: caption });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/send', requireAuth, async (req, res) => {
  try {
    const { caption, photoUrl } = await renderPreview(req.body);
    await telegram.sendPhoto(photoUrl, caption);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
module.exports.renderPreview = renderPreview;
module.exports.resolveLang = resolveLang;

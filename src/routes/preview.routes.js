'use strict';

const express = require('express');
const router = express.Router();

const { renderSonarr, renderRadarr } = require('../template-engine');
const telegram = require('../telegram');
const { requireAuth } = require('../middlewares/auth');
const { MOCK_SONARR, MOCK_RADARR } = require('../mocks/media-mocks');
const { enrichSonarrMedia, enrichRadarrMedia } = require('../services/media-enricher');
const templates = require('../templates');

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

router.post('/render', requireAuth, async (req, res) => {
  try {
    const { type, scenario, template } = req.body;
    let html = '';
    const activeMode = templates.getActiveMode();

    if (type === 'sonarr') {
      const series = enrichSonarrMedia(MOCK_SONARR.series);
      const eps = MOCK_SONARR[scenario] || MOCK_SONARR.single;
      html = renderSonarr(template || null, series, eps);
    } else {
      const previewMovie = buildPreviewRadarrMovie();
      const { movie, tmdbMovie, ratings } = await enrichRadarrMedia(
        previewMovie,
        MOCK_RADARR.tmdb,
        null,
        activeMode
      );

      if (tmdbMovie && tmdbMovie._overviewAr) tmdbMovie.overview = tmdbMovie._overviewAr;

      const { caption } = renderRadarr(template || null, movie, tmdbMovie, ratings);
      html = caption;
    }

    res.json({ success: true, html });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

router.post('/send', requireAuth, async (req, res) => {
  try {
    const { type, scenario, template } = req.body;
    let html = '';
    let photoUrl = '';
    const activeMode = templates.getActiveMode();

    if (type === 'sonarr') {
      const series = enrichSonarrMedia(MOCK_SONARR.series);
      const eps = MOCK_SONARR[scenario] || MOCK_SONARR.single;
      html = renderSonarr(template || null, series, eps);
      photoUrl = 'https://artworks.thetvdb.com/banners/posters/81189-22.jpg';
    } else {
      const previewMovie = buildPreviewRadarrMovie();
      const { movie, tmdbMovie, ratings } = await enrichRadarrMedia(
        previewMovie,
        MOCK_RADARR.tmdb,
        null,
        activeMode
      );

      if (tmdbMovie && tmdbMovie._overviewAr) tmdbMovie.overview = tmdbMovie._overviewAr;

      const { caption } = renderRadarr(template || null, movie, tmdbMovie, ratings);
      html = caption;
      photoUrl = 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg';
    }

    await telegram.sendPhoto(photoUrl, html);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

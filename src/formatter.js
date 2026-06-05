'use strict';
const config    = require('./config');
const templates = require('./templates');
const { renderSonarr } = require('./template-engine');
const { enrichSonarrMedia } = require('./services/media-enricher');

function getPosterUrl(series) {
  if (!series.images || series.images.length === 0) return null;
  const poster = series.images.find(img => img.coverType === 'poster');
  return poster ? (poster.remoteUrl || config.sonarr.baseUrl + poster.url) : null;
}

function buildCaption(series, episodes) {
  const enrichedSeries = enrichSonarrMedia(series);

  const template = templates.resolveTemplate(templates.getActiveMode(), 'sonarr');

  return renderSonarr(template, enrichedSeries, episodes);
}

module.exports = { buildCaption, getPosterUrl };

'use strict';
const templates = require('./templates');
const { renderRadarr } = require('./template-engine');

function getPosterUrl(movie) {
  const poster = (movie.images || []).find(img => img.coverType === 'poster');
  return poster ? poster.remoteUrl : null;
}

function buildMovieCaption(movie, tmdbMovie, ratings = {}) {
  let template = 'DEFAULT_AR';
  const activeMode = templates.getActiveMode();
  if (activeMode === 'default_en') template = 'DEFAULT_EN';
  else if (activeMode !== 'default_ar') {
    const slot = templates.getSlotById(activeMode);
    if (slot && slot.radarr) template = slot.radarr;
  }
  
  return renderRadarr(template, movie, tmdbMovie, ratings);
}

module.exports = { buildMovieCaption, getPosterUrl };

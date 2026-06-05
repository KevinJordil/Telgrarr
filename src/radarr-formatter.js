'use strict';
const templates = require('./templates');
const { renderRadarr } = require('./template-engine');

function getPosterUrl(movie) {
  const poster = (movie.images || []).find(img => img.coverType === 'poster');
  return poster ? poster.remoteUrl : null;
}

function buildMovieCaption(movie, tmdbMovie, ratings = {}) {
  const template = templates.resolveTemplate(templates.getActiveMode(), 'radarr');
  
  return renderRadarr(template, movie, tmdbMovie, ratings);
}

module.exports = { buildMovieCaption, getPosterUrl };

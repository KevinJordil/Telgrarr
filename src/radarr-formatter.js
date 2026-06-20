'use strict';
const config = require('./config');
const templates = require('./templates');
const { renderRadarr } = require('./template-engine');
const { resolveComposed } = require('./templates/layout-fragments');

function getPosterUrl(movie) {
  const poster = (movie.images || []).find(img => img.coverType === 'poster');
  return poster ? poster.remoteUrl : null;
}

function buildMovieCaption(movie, tmdbMovie, ratings = {}) {
  const resolved = templates.resolveTemplate(templates.getActiveMode(), 'radarr');
  const { template, lang } = resolveComposed('radarr', resolved, config.translator?.targetLang, templates.getLayout().radarr);
  
  return renderRadarr(template, movie, tmdbMovie, ratings, lang ? { lang } : undefined);
}

module.exports = { buildMovieCaption, getPosterUrl };

'use strict';
const config = require('../config');

function attachSeerr(media, type) {
  const base = config.seerr?.publicUrl || config.seerr?.baseUrl;
  if (!base) return { ...media };
  
  const copy = { ...media };
  copy._seerrUrl = copy.tmdbId 
    ? `${base}/${type}/${copy.tmdbId}`
    : `${base}/search?query=${encodeURIComponent(copy.title || '')}`;
  return copy;
}

function resolveRating(radarrVal, fallbackVal, format) {
  const v = (radarrVal > 0) ? radarrVal : (fallbackVal > 0 ? fallbackVal : 0);
  if (!v || v <= 0) return null;
  return format(v);
}

module.exports = { attachSeerr, resolveRating };

'use strict';
const axios = require('axios');
const config = require('../config');
const { text, id } = require('./model');
function seasonsFor(event) {
  if (event.mediaType === 'movie') return [];
  const values = event.season !== undefined && event.season !== '' ? [event.season] : String(event.seasons || '').split(',');
  return [...new Set(values.map(value => id(String(value).trim())).filter(Boolean))].map(Number).sort((a, b) => a - b);
}
function choose(videos, season, languageKnown = false) {
  const candidates = (videos || []).filter(video => {
    const name = text(video.name, 500);
    if (video.site !== 'YouTube' || video.type !== 'Trailer' || !/^[\w-]{11}$/.test(video.key || '')) return false;
    // Do not use English fallback videos returned by Seerr, or a VOST trailer
    // where a French version was requested.
    if (/\bvost(?:fr)?\b|sous[- ]titr/i.test(name)) return false;
    if (video.iso_639_1 ? video.iso_639_1 !== 'fr' : !languageKnown && !/\bVF\b|fran[cç]ais(?:e)?|bande[- ]annonce/i.test(name)) return false;
    if (season !== undefined && !languageKnown) {
      const found = [...name.matchAll(/\b(?:saison|season)\s*(\d+)\b|\bS(\d{1,2})\b/gi)].map(m => Number(m[1] || m[2]));
      if (!found.includes(season)) return false;
    }
    return true;
  }).sort((a, b) => Number(!!b.official) - Number(!!a.official)
    || Number(/\bVF\b/i.test(b.name)) - Number(/\bVF\b/i.test(a.name)));
  return candidates[0];
}
function search(title, season) {
  const query = `${title}${season !== undefined ? ` saison ${season}` : ''} bande annonce officielle VF`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
async function trailers(event, details) {
  if (config.notifications?.trailersEnabled === false) return [];
  const seasons = seasonsFor(event);
  if (event.mediaType !== 'movie' && !seasons.length) return [];
  const targets = event.mediaType === 'movie' ? [undefined] : seasons;
  const output = [];
  for (const season of targets) {
    let video = null;
    if (config.tmdb?.apiKey && event.tmdbId) {
      try {
        const resource = season === undefined ? `movie/${event.tmdbId}/videos` : `tv/${event.tmdbId}/season/${season}/videos`;
        const { data } = await axios.get(`https://api.themoviedb.org/3/${resource}`, {
          params: { api_key: config.tmdb.apiKey, language: 'fr-FR' }, timeout: 10000,
        });
        video = choose(data.results, season, true);
      } catch { /* Optional metadata must not prevent a notification. */ }
    }
    video = video || choose(details?.relatedVideos, season);
    const title = event.seriesTitle || event.title || 'Titre inconnu';
    output.push({
      season, isSearch: !video,
      url: video ? `https://www.youtube.com/watch?v=${video.key}` : search(title, season),
      label: `${video ? 'Bande-annonce FR' : 'Rechercher la bande-annonce VF'}${season !== undefined ? ` — saison ${season}` : ''}`,
    });
  }
  return output;
}
module.exports = { trailers, choose, seasonsFor };

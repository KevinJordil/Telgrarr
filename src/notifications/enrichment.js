'use strict';
const axios = require('axios');
const config = require('../config');
const blacklist = require('../blacklist');
const { id, text } = require('./model');

async function api(section, resource, params) {
  const settings = config[section];
  if (!settings?.baseUrl || !settings.apiKey) return null;
  const response = await axios.get(`${settings.baseUrl.replace(/\/+$/, '')}/${resource}`, {
    headers: { 'X-Api-Key': settings.apiKey }, params, timeout: 15000,
  });
  return response.data;
}
function guidId(guids, provider) {
  const match = (guids || []).map(g => typeof g === 'string' ? g : g.id).find(g => g?.startsWith(`${provider}://`));
  return id(match?.split('://')[1]);
}
async function plexMetadata(event) {
  if (!config.tautulli?.baseUrl || !config.tautulli.apiKey) return event;
  const response = await api('tautulli', 'api/v2', { cmd: 'get_metadata', rating_key: event.ratingKey });
  if (response?.response?.result !== 'success') throw new Error('Tautulli metadata unavailable');
  const metadata = response.response.data;
  const series = ['episode', 'season'].includes(event.mediaType);
  const parentKey = event.mediaType === 'episode' ? metadata.grandparent_rating_key : metadata.parent_rating_key;
  let parent = null;
  if (series && parentKey) {
    const result = await api('tautulli', 'api/v2', { cmd: 'get_metadata', rating_key: parentKey });
    parent = result?.response?.data;
  }
  const guids = series ? (parent?.guids || metadata.grandparent_guids || metadata.parent_guids) : metadata.guids;
  const info = metadata.media_info?.[0] || {};
  const video = (info.parts || []).flatMap(part => part.streams || []).find(stream => String(stream.type) === '1') || {};
  return {
    ...event,
    title: text(metadata.title) || event.title,
    seriesTitle: series ? text(parent?.title || metadata.grandparent_title || metadata.parent_title) || event.seriesTitle : event.seriesTitle,
    year: id(parent?.year || metadata.year) || event.year,
    tmdbId: guidId(guids, 'tmdb') || event.tmdbId, tvdbId: guidId(guids, 'tvdb') || event.tvdbId,
    overview: text(parent?.summary || metadata.summary, 1500) || event.overview,
    season: id(event.mediaType === 'episode' ? metadata.parent_media_index : metadata.media_index) || event.season,
    episodeNumber: id(metadata.media_index) || event.episodeNumber,
    resolution: text(info.video_resolution || metadata.video_resolution, 30) || event.resolution,
    codec: text(info.video_codec || metadata.video_codec, 30) || event.codec,
    dynamicRange: Number(video.video_dovi_present) ? 'Dolby Vision' : text(video.video_dynamic_range || info.video_dynamic_range, 30) || event.dynamicRange,
  };
}
async function findArr(event) {
  const movie = event.mediaType === 'movie';
  const items = await api(movie ? 'radarr' : 'sonarr', `api/v3/${movie ? 'movie' : 'series'}`, movie && event.tmdbId ? { tmdbId: event.tmdbId } : undefined);
  if (!Array.isArray(items)) return null;
  return items.find(item => (event.tmdbId && String(item.tmdbId) === event.tmdbId)
    || (!movie && event.tvdbId && String(item.tvdbId) === event.tvdbId)) || null;
}
async function requestOrigin(event) {
  if (!event.tmdbId) return null;
  const details = await api('seerr', `api/v1/${event.mediaType === 'movie' ? 'movie' : 'tv'}/${event.tmdbId}`);
  const requests = details?.mediaInfo?.requests || [];
  // A declined or failed request must not be attributed to an available item.
  const relevant = requests.filter(r => [1, 2, 5].includes(Number(r.status))
    && (!event.season || !r.seasons?.length || r.seasons.some(season => String(season.seasonNumber) === event.season)));
  const users = [...new Set(relevant.map(r => text(r.requestedBy?.displayName || r.requestedBy?.plexUsername || r.requestedBy?.username)).filter(Boolean))];
  return users.length ? `Demande Seerr — ${users.join(', ')}` : relevant.length ? 'Demande Seerr' : null;
}
async function listOrigin(movie) {
  if (!movie?.tags?.length) return null;
  const [lists, tags] = await Promise.all([api('radarr', 'api/v3/importlist'), api('radarr', 'api/v3/tag')]);
  const matches = (lists || []).filter(list => list.enabled && (list.tags || []).some(tag => movie.tags.includes(tag)));
  if (!matches.length) return null;
  const names = [...new Set(matches.map(list => text(list.name) || (tags || []).find(t => (list.tags || []).includes(t.id))?.label).filter(Boolean))];
  return names.length ? `Liste Radarr probable — ${names.join(', ')}` : null;
}
async function quality(event, arr) {
  let name = arr?.movieFile?.quality?.quality?.name;
  if (event.mediaType === 'episode' && arr) {
    const episodes = await api('sonarr', 'api/v3/episode', { seriesId: arr.id });
    const episode = episodes?.find(e => String(e.seasonNumber) === event.season && String(e.episodeNumber) === event.episodeNumber);
    if (episode?.episodeFileId) {
      const file = await api('sonarr', `api/v3/episodefile/${episode.episodeFileId}`);
      name = file?.quality?.quality?.name;
    }
  }
  // Show/season events can contain mixed qualities: never infer one from an arbitrary episode.
  return [...new Set([name || event.quality || (/^(480|576|720|1080|2160)$/.test(event.resolution || '') ? `${event.resolution}p` : event.resolution), event.codec?.toUpperCase(), event.dynamicRange].filter(Boolean))].join(' · ');
}
async function enrich(input) {
  let event = input.event === 'available' ? await plexMetadata({ ...input }) : { ...input };
  const notes = [];
  let arr = null;
  if (event.event === 'available') {
    try { arr = await findArr(event); } catch { notes.push('arr-unavailable'); }
    const source = event.mediaType === 'movie' ? 'radarr' : 'sonarr';
    if (arr && (blacklist.isIdBlacklisted(source, arr.id) || blacklist.isPathBlacklisted(source, arr.path))) {
      return { ...event, suppressed: true, enrichmentNotes: ['blacklisted'] };
    }
    if (!event.tmdbId && arr?.tmdbId) event.tmdbId = String(arr.tmdbId);
    try { event.origin = await requestOrigin(event); } catch { notes.push('seerr-unavailable'); }
    if (!event.origin && event.mediaType === 'movie') {
      try { event.origin = await listOrigin(arr); } catch { notes.push('lists-unavailable'); }
    }
    try { event.quality = await quality(event, arr); } catch { event.quality = event.quality || event.resolution; notes.push('quality-unavailable'); }
  }
  if (config.tmdb.apiKey && event.tmdbId) {
    try {
      const { data } = await axios.get(`https://api.themoviedb.org/3/${event.mediaType === 'movie' ? 'movie' : 'tv'}/${event.tmdbId}`, {
        headers: {}, params: { api_key: config.tmdb.apiKey, language: 'fr-FR' }, timeout: 15000,
      });
      if (data.overview) event.overview = text(data.overview, 1500);
      if (event.event === 'request') {
        event.title = text(data.title || data.name) || event.title;
        event.year = id((data.release_date || data.first_air_date || '').slice(0, 4)) || event.year;
      }
    } catch { notes.push('tmdb-unavailable'); }
  }
  return { ...event, enrichmentNotes: notes };
}
module.exports = { enrich, guidId };

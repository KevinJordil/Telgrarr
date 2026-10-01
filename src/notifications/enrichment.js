'use strict';
const axios = require('axios');
const config = require('../config');
const blacklist = require('../blacklist');
const imdb = require('./imdb');
const { trailers } = require('./trailers');
const { id, text, safeUrl } = require('./model');

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
function imdbScore(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 10 ? n.toFixed(1).replace('.', ',') : '';
}
function plexImdb(metadata) {
  if (String(metadata?.audience_rating_image).startsWith('imdb://')) return imdbScore(metadata.audience_rating);
  if (String(metadata?.rating_image).startsWith('imdb://')) return imdbScore(metadata.rating);
  return '';
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
    imdbRating: plexImdb(series ? parent : metadata),
    imdbId: imdb.validId((guids || []).map(g => typeof g === 'string' ? g : g.id).find(g => g?.startsWith('imdb://'))?.slice(7)),
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
function requestOrigin(event, details) {
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
function rangeNumbers(range) {
  const values = new Set();
  for (const part of String(range || '').split(',')) {
    if (!/^\d+(?:-\d+)?$/.test(part)) return [];
    const [first, last = first] = part.split('-').map(Number);
    if (first < 0 || last < first || last > 1000) return [];
    for (let n = first; n <= last; n++) values.add(n);
  }
  return [...values].sort((a, b) => a - b);
}
async function quality(event, arr) {
  let name = arr?.movieFile?.quality?.quality?.name;
  if (['episode', 'season'].includes(event.mediaType) && arr) {
    const episodes = await api('sonarr', 'api/v3/episode', { seriesId: arr.id });
    if (event.mediaType === 'episode') {
      const episode = episodes?.find(e => String(e.seasonNumber) === event.season && String(e.episodeNumber) === event.episodeNumber);
      if (episode?.episodeFileId) {
        const file = await api('sonarr', `api/v3/episodefile/${episode.episodeFileId}`);
        name = file?.quality?.quality?.name;
      }
    } else {
      const numbers = rangeNumbers(event.episodeRange);
      const season = (episodes || []).filter(e => String(e.seasonNumber) === event.season);
      // A batch must cover every known episode, all with files, before claiming
      // completeness. Several episodes arriving together alone is insufficient.
      event.seasonEpisodeCount = season.length ? String(season.length) : '';
      event.addedEpisodeCount = numbers.length ? String(numbers.length) : event.episodeCount;
      event.seasonComplete = season.length > 0 && numbers.length === season.length
        && season.every(e => numbers.includes(e.episodeNumber) && e.hasFile);
      const selected = season.filter(e => numbers.includes(e.episodeNumber));
      if (selected.length) {
        const files = await api('sonarr', 'api/v3/episodefile', { seriesId: arr.id });
        const fileIds = new Set(selected.map(e => e.episodeFileId).filter(Boolean));
        const names = [...new Set((files || []).filter(f => fileIds.has(f.id)).map(f => f.quality?.quality?.name).filter(Boolean))];
        if (names.length) name = names.join(' / ');
      }
    }
  }
  return [...new Set([name || event.quality || (/^(480|576|720|1080|2160)$/.test(event.resolution || '') ? `${event.resolution}p` : event.resolution), event.codec?.toUpperCase(), event.dynamicRange].filter(Boolean))].join(' · ');
}

async function enrich(input) {
  let event = input.event === 'available' ? await plexMetadata({ ...input }) : { ...input };
  const notes = [];
  let arr = null;
  let details = null;
  if (event.tmdbId) {
    try {
      details = await api('seerr', `api/v1/${event.mediaType === 'movie' ? 'movie' : 'tv'}/${event.tmdbId}`, { language: 'fr' });
      if (/^\/[a-zA-Z0-9._/-]+$/.test(details?.posterPath || '')) event.posterUrl = `https://image.tmdb.org/t/p/w500${details.posterPath}`;
      if (event.event === 'request') {
        event.title = text(details?.title || details?.name) || event.title;
        event.year = id((details?.releaseDate || details?.firstAirDate || '').slice(0, 4)) || event.year;
      }
    } catch { notes.push('seerr-unavailable'); }
  }
  if (event.event === 'available') {
    try { arr = await findArr(event); } catch { notes.push('arr-unavailable'); }
    const source = event.mediaType === 'movie' ? 'radarr' : 'sonarr';
    if (arr && (blacklist.isIdBlacklisted(source, arr.id) || blacklist.isPathBlacklisted(source, arr.path))) {
      return { ...event, suppressed: true, enrichmentNotes: ['blacklisted'] };
    }
    if (!event.tmdbId && arr?.tmdbId) event.tmdbId = String(arr.tmdbId);
    try { event.origin = requestOrigin(event, details); } catch { notes.push('seerr-unavailable'); }
    if (!event.origin && event.mediaType === 'movie') {
      try { event.origin = await listOrigin(arr); } catch { notes.push('lists-unavailable'); }
    }
    try { event.quality = await quality(event, arr); } catch { event.quality = event.quality || event.resolution; notes.push('quality-unavailable'); }
  }
  event.posterUrl = event.posterUrl || safeUrl(arr?.images?.find(image => image.coverType === 'poster')?.remoteUrl);
  event.imdbRating = event.imdbRating || imdbScore(arr?.ratings?.imdb?.value);
  if (!event.imdbRating && event.mediaType === 'movie' && event.tmdbId) {
    try {
      const ratings = await api('seerr', `api/v1/movie/${event.tmdbId}/ratingscombined`);
      event.imdbRating = imdbScore(ratings?.imdb?.criticsScore);
    } catch { notes.push('imdb-unavailable'); }
  }
  if (event.mediaType !== 'movie' && !event.imdbRating) {
    // Both Seerr TV external IDs and Plex parent GUIDs refer to the series,
    // never the IMDb ID of the individual episode.
    const seriesId = imdb.validId(details?.externalIds?.imdbId) || imdb.validId(arr?.imdbId) || imdb.validId(event.imdbId);
    try { event.imdbRating = imdbScore(await imdb.lookup(seriesId)); }
    catch { notes.push('imdb-unavailable'); }
  }
  if (config.tmdb.apiKey && event.tmdbId) {
    try {
      const { data } = await axios.get(`https://api.themoviedb.org/3/${event.mediaType === 'movie' ? 'movie' : 'tv'}/${event.tmdbId}`, {
        headers: {}, params: { api_key: config.tmdb.apiKey, language: 'fr-FR' }, timeout: 15000,
      });
      if (!event.posterUrl && /^\/[a-zA-Z0-9._/-]+$/.test(data.poster_path || '')) event.posterUrl = `https://image.tmdb.org/t/p/w500${data.poster_path}`;
      if (data.overview) event.overview = text(data.overview, 1500);
      if (event.event === 'request') {
        event.title = text(data.title || data.name) || event.title;
        event.year = id((data.release_date || data.first_air_date || '').slice(0, 4)) || event.year;
      }
    } catch { notes.push('tmdb-unavailable'); }
  }
  event.trailers = await trailers(event, details);
  return { ...event, enrichmentNotes: notes };
}
module.exports = { enrich, guidId, rangeNumbers };

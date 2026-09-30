'use strict';
const Handlebars = require('handlebars');

const REQUEST_TEMPLATE = '<b>Nouvelle demande de {{kind}}</b>\n<b>{{title}}{{#if year}} ({{year}}){{/if}}</b>\nDemandé par : {{requester}}{{#if seasons}}\nSaison(s) : {{seasons}}{{/if}}{{#if seerrUrl}}\n\n<a href="{{seerrUrl}}">Voir la demande</a>{{/if}}';
const AVAILABLE_TEMPLATE = '<b>{{kind}} disponible sur Plex</b>\n<b>{{title}}{{#if year}} ({{year}}){{/if}}</b>{{#if episode}}\n{{episode}}{{/if}}{{#if overview}}\n\n{{overview}}{{/if}}\n\nOrigine : {{origin}}\nQualité : {{quality}}{{#if plexUrl}}\n\n<a href="{{plexUrl}}">Voir sur Plex</a>{{/if}}{{#if seerrUrl}} · <a href="{{seerrUrl}}">Voir sur Seerr</a>{{/if}}';
const TYPES = new Set(['movie', 'show', 'season', 'episode']);
const REQUEST_EVENTS = new Set(['MEDIA_PENDING', 'MEDIA_APPROVED', 'MEDIA_AUTO_APPROVED']);
function id(value) { return /^\d+$/.test(String(value ?? '')) ? String(value) : ''; }
function text(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    // A notification must never forward an API key or bearer token to Telegram.
    for (const key of url.searchParams.keys()) if (/token|api.?key|secret|auth/i.test(key)) return '';
    return url.href;
  } catch { return ''; }
}
function normalizeSeerr(payload) {
  if (!REQUEST_EVENTS.has(payload.notification_type)) return null;
  const media = payload.media || {};
  const request = payload.request || {};
  const requestId = id(request.request_id || request.id || payload.request_id);
  const mediaType = media.media_type || media.mediaType || payload.media_type;
  if (!requestId || !['movie', 'tv'].includes(mediaType)) throw new Error('Missing request ID or media type');
  const tmdbId = id(media.tmdbId || media.tmdb_id || payload.tmdb_id);
  return {
    event: 'request', requestId, mediaType, tmdbId,
    title: text(payload.subject || payload.title), year: id(payload.year),
    requester: text(request.requestedBy_username || request.requestedBy?.displayName || payload.requester) || 'Utilisateur inconnu',
    seasons: text(payload.seasons || (payload.extra || []).find(e => /season/i.test(e.name))?.value),
    overview: text(payload.message, 1500),
  };
}
function normalizeTautulli(payload) {
  if (payload.action !== 'created') return null;
  const mediaType = payload.media_type;
  const ratingKey = id(payload.rating_key);
  const serverId = text(payload.server_machine_id, 128);
  if (!TYPES.has(mediaType) || !ratingKey || !serverId) throw new Error('Missing media type, rating key or server identifier');
  return {
    event: 'available', mediaType, ratingKey, serverId,
    title: text(payload.title), year: id(payload.year),
    tmdbId: id(payload.tmdb_id || payload.themoviedb_id), tvdbId: id(payload.tvdb_id),
    seriesTitle: text(payload.grandparent_title || payload.parent_title),
    season: id(payload.season_num || payload.parent_media_index), episodeNumber: id(payload.episode_num || payload.media_index),
    overview: text(payload.summary, 1500), quality: text(payload.quality),
    resolution: text(payload.video_resolution, 30), codec: text(payload.video_codec, 30),
    dynamicRange: text(payload.video_dynamic_range, 30),
    addedAt: id(payload.added_at), plexUrl: safeUrl(payload.plex_url),
  };
}
function eventKey(event) {
  // Upgrades of the same Plex item do not repeat its original availability announcement.
  return event.event === 'request' ? `request:${event.requestId}` : `plex:${event.serverId}:${event.ratingKey}`;
}
function seerrLink(baseUrl, mediaType, tmdbId) {
  const base = safeUrl(baseUrl);
  return base && tmdbId ? `${base.replace(/\/+$/, '')}/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}` : '';
}
function viewData(event, settings) {
  const movie = event.mediaType === 'movie';
  const kind = event.event === 'request' ? (movie ? 'film' : 'série') : ({ movie: 'Film', show: 'Série', season: 'Saison', episode: 'Épisode' }[event.mediaType]);
  let episode = '';
  if (event.mediaType === 'episode') episode = `S${String(event.season || '0').padStart(2, '0')}E${String(event.episodeNumber || '0').padStart(2, '0')}${event.title ? ' — ' + event.title : ''}`;
  if (event.mediaType === 'season' && event.season) episode = `Saison ${event.season}`;
  const plexUrl = safeUrl(event.plexUrl) || (event.ratingKey && event.serverId
    ? `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(event.serverId)}/details?key=${encodeURIComponent('/library/metadata/' + event.ratingKey)}` : '');
  return {
    ...event, kind, title: (!movie && event.seriesTitle) || event.title || 'Titre inconnu', episode,
    overview: text(event.overview, settings.notifications.summaryLength),
    origin: event.origin || 'Inconnue', quality: event.quality || 'Non renseignée',
    plexUrl, seerrUrl: seerrLink(settings.seerr.baseUrl, event.mediaType, event.tmdbId),
  };
}
function render(event, settings) {
  const data = viewData(event, settings);
  const template = event.event === 'request' ? settings.notifications.requestTemplate : settings.notifications.availableTemplate;
  // Values are escaped by Handlebars. Triple braces would bypass escaping for external metadata.
  if (/\{\{\{|\{\{&/.test(template)) throw new Error('Use escaped template variables only');
  const compile = Handlebars.compile(template, { strict: false });
  let caption = compile(data);
  if (caption.length > 4000) {
    data.overview = '';
    caption = compile(data);
  }
  if (!caption.trim() || caption.length > 4000) throw new Error('Notification template is empty or exceeds 4000 characters');
  return caption;
}
module.exports = { REQUEST_TEMPLATE, AVAILABLE_TEMPLATE, normalizeSeerr, normalizeTautulli, eventKey, viewData, render, safeUrl, id, text };

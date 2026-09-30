'use strict';
const Handlebars = require('handlebars');

const REQUEST_TEMPLATE = '<b>{{title}}{{#if year}} ({{year}}){{/if}}</b>\n<i>Nouvelle demande de {{kind}}</i>\n━━━━━━━━━━━━━━━━━━{{#if imdbRating}}\n\n<b>IMDb :</b> {{imdbRating}}/10{{/if}}{{#if seasons}}\n<b>Saison(s) :</b> {{seasons}}{{/if}}\n\n<b>Demandé par :</b>\n{{requester}}{{#each trailers}}\n<a href="{{url}}">{{label}}</a>{{/each}}';
const AVAILABLE_TEMPLATE = '<b>{{title}}{{#if year}} ({{year}}){{/if}}</b>\n<i>{{kind}} disponible sur Plex</i>{{#if episode}}\n\n<b>{{episode}}</b>{{/if}}{{#if imdbRating}}\n<b>IMDb :</b> {{imdbRating}}/10{{/if}}{{#if overview}}\n\n━━━━━━━━━━━━━━━━━━\n<i>{{overview}}</i>{{/if}}\n\n━━━━━━━━━━━━━━━━━━\n<b>Origine :</b>\n{{origin}}\n\n<b>Qualité :</b>\n<code>{{quality}}</code>{{#if plexUrl}}\n\n<a href="{{plexUrl}}">Voir sur Plex</a>{{/if}}{{#each trailers}}\n<a href="{{url}}">{{label}}</a>{{/each}}';
const REQUEST_RICH_TEMPLATE = '{{#if posterUrl}}<img src="{{posterUrl}}"/>{{/if}}<h2>{{title}}{{#if year}} ({{year}}){{/if}}</h2><p><i>Nouvelle demande de {{kind}}</i></p>{{#if imdbRating}}<p><b>IMDb :</b> {{imdbRating}}/10</p>{{/if}}{{#if seasons}}<p><b>Saison(s) :</b> {{seasons}}</p>{{/if}}<hr/><p><b>Demandé par :</b> {{requester}}</p><p>{{#each trailers}}<br/><a href="{{url}}">{{label}}</a>{{/each}}</p>';
const AVAILABLE_RICH_TEMPLATE = '{{#if posterUrl}}<img src="{{posterUrl}}"/>{{/if}}<h2>{{title}}{{#if year}} ({{year}}){{/if}}</h2><p><i>{{kind}} disponible sur Plex</i></p>{{#if episode}}<h4>{{episode}}</h4>{{/if}}{{#if imdbRating}}<p><b>IMDb :</b> {{imdbRating}}/10</p>{{/if}}{{#if overview}}<blockquote>{{overview}}</blockquote>{{/if}}<hr/><p><b>Origine :</b><br/>{{origin}}</p><p><b>Qualité :</b><br/><code>{{quality}}</code></p><hr/><p>{{#if plexUrl}}<a href="{{plexUrl}}">Voir sur Plex</a>{{/if}}{{#each trailers}}<br/><a href="{{url}}">{{label}}</a>{{/each}}</p>';
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
    ...(payload.test === true ? { isTest: true, testId: text(payload.test_id, 128) || 'default' } : {}),
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
    ...(payload.test === true ? { isTest: true, testId: text(payload.test_id, 128) || 'default' } : {}),
    title: text(payload.title), year: id(payload.year),
    tmdbId: id(payload.tmdb_id || payload.themoviedb_id), tvdbId: id(payload.tvdb_id),
    seriesTitle: text(payload.grandparent_title || payload.parent_title),
    season: id(payload.season_num || payload.parent_media_index), episodeNumber: id(payload.episode_num || payload.media_index),
    overview: text(payload.summary, 1500), quality: text(payload.quality),
    resolution: text(payload.video_resolution, 30), codec: text(payload.video_codec, 30),
    dynamicRange: text(payload.video_dynamic_range, 30),
    episodeRange: /^[0-9, -]+$/.test(String(payload.episode_num || '')) ? text(String(payload.episode_num), 300).replace(/ /g, '') : '',
    episodeCount: id(payload.episode_count),
    addedAt: id(payload.added_at), plexUrl: safeUrl(payload.plex_url),
  };
}
function eventKey(event) {
  // Upgrades of the same Plex item do not repeat its original availability announcement.
  const suffix = event.mediaType === 'season' && event.episodeRange ? `:episodes:${event.episodeRange}` : '';
  const key = event.event === 'request' ? `request:${event.requestId}` : `plex:${event.serverId}:${event.ratingKey}${suffix}`;
  return event.isTest ? `test:${event.testId}:${key}` : key;
}
function seerrLink(baseUrl, mediaType, tmdbId) {
  const base = safeUrl(baseUrl);
  return base && tmdbId ? `${base.replace(/\/+$/, '')}/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}` : '';
}
function summary(value, limit) {
  const full = text(value, 1500).replace(/\s+/g, ' ');
  if (!limit) return '';
  if (full.length <= limit) return full;
  const cut = full.slice(0, limit - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).replace(/[ ,;:-]+$/, '') + '…';
}
function viewData(event, settings) {
  const movie = event.mediaType === 'movie';
  let kind = event.event === 'request' ? (movie ? 'film' : 'série') : ({ movie: 'Film', show: 'Série', season: 'Saison', episode: 'Épisode' }[event.mediaType]);
  if (event.mediaType === 'season' && event.seasonComplete) kind = 'Saison complète';
  if (event.mediaType === 'season' && event.episodeRange && !event.seasonComplete) kind = 'Épisodes';
  let episode = '';
  if (event.mediaType === 'episode') episode = `S${String(event.season || '0').padStart(2, '0')}E${String(event.episodeNumber || '0').padStart(2, '0')}${event.title ? ' — ' + event.title : ''}`;
  if (event.mediaType === 'season' && event.season) episode = `Saison ${event.season}${event.episodeRange ? ` — épisodes ${event.episodeRange.replace(/-/g, '–').replace(/,/g, ', ')}` : ''}${event.episodeCount ? ` (${event.episodeCount} épisodes)` : ''}`;
  const plexUrl = safeUrl(event.plexUrl) || (event.ratingKey && event.serverId
    ? `https://app.plex.tv/desktop/#!/server/${encodeURIComponent(event.serverId)}/details?key=${encodeURIComponent('/library/metadata/' + event.ratingKey)}` : '');
  return {
    ...event, posterUrl: safeUrl(event.posterUrl), trailers: (event.trailers || []).map(trailer => ({ ...trailer, url: safeUrl(trailer.url) })).filter(trailer => trailer.url), kind, title: (!movie && event.seriesTitle) || event.title || 'Titre inconnu', episode,
    overview: summary(event.overview, settings.notifications.summaryLength),
    origin: event.origin || 'Inconnue', quality: event.quality || 'Non renseignée',
    plexUrl, seerrUrl: '',
  };
}
function render(event, settings, maxLength = 4000) {
  const data = viewData(event, settings);
  const template = event.event === 'request' ? settings.notifications.requestTemplate : settings.notifications.availableTemplate;
  // Values are escaped by Handlebars. Triple braces would bypass escaping for external metadata.
  if (/\{\{\{|\{\{&/.test(template)) throw new Error('Use escaped template variables only');
  const compile = Handlebars.compile(event.mediaType === 'season' && data.kind === 'Épisodes' ? template.replace('{{kind}} disponible sur Plex', '{{kind}} disponibles sur Plex') : template, { strict: false });
  let caption = compile(data);
  const prefix = event.isTest ? '[TEST Telgrarr]\n\n' : '';
  if (caption.length + prefix.length > maxLength) {
    data.overview = summary(event.overview, Math.max(0, data.overview.length - (caption.length + prefix.length - maxLength) - 20));
    caption = compile(data);
  }
  if (caption.length + prefix.length > maxLength) {
    data.overview = '';
    caption = compile(data);
  }
  if (!caption.trim() || caption.length + prefix.length > maxLength) throw new Error('Notification template is empty or exceeds 4000 characters');
  return prefix + caption;
}
function renderRich(event, settings) {
  const adapted = { ...settings, notifications: { ...settings.notifications,
    requestTemplate: settings.notifications.requestRichTemplate || REQUEST_RICH_TEMPLATE,
    availableTemplate: settings.notifications.availableRichTemplate || AVAILABLE_RICH_TEMPLATE,
  } };
  const html = render(event, adapted, 28000);
  if (!event.isTest) return html;
  const content = html.replace('[TEST Telgrarr]\n\n', '');
  return /<h[1-6](?:\s[^>]*)?>/i.test(content)
    ? content.replace(/(<h[1-6](?:\s[^>]*)?>)/i, '$1[TEST Telgrarr] — ')
    : `${content}<footer>[TEST Telgrarr]</footer>`;
}
function presentation(event, settings, format = settings.notifications.format) {
  if (format === 'rich') return { caption: renderRich(event, settings), posterUrl: safeUrl(event.posterUrl), format: 'rich' };
  let caption = render(event, settings);
  let posterUrl = safeUrl(event.posterUrl);
  if (posterUrl) {
    try { caption = render(event, settings, 1024); }
    catch { posterUrl = ''; }
  }
  return { caption, posterUrl, format: 'classic' };
}
module.exports = { REQUEST_TEMPLATE, AVAILABLE_TEMPLATE, REQUEST_RICH_TEMPLATE, AVAILABLE_RICH_TEMPLATE, renderRich, presentation, normalizeSeerr, normalizeTautulli, eventKey, viewData, render, safeUrl, id, text };

'use strict';
const axios = require('axios');
const config = require('../config');
const store = require('./store');
const { id, text } = require('./model');
const INTERVAL_MS = 30000;
const PAGE_SIZE = 50;
async function get(resource, params) {
  const response = await axios.get(`${config.seerr.baseUrl.replace(/\/+$/, '')}/api/v1/${resource}`, {
    headers: { 'X-Api-Key': config.seerr.apiKey }, params, timeout: 15000,
  });
  return response.data;
}
async function poll() {
  if (!config.notifications?.enabled || config.notifications.requestSource !== 'poll'
      || !config.seerr.baseUrl || !config.seerr.apiKey) return;
  const cursor = store.requestCursor();
  const requests = [];
  let skip = 0;
  // Paginate until the last seen request; never skip a burst larger than one page.
  while (true) {
    const page = await get('request', { take: PAGE_SIZE, skip, sort: 'added' });
    if (!Array.isArray(page.results)) throw new Error('Invalid Seerr request response');
    if (cursor === null) {
      await store.setRequestCursor(Math.max(0, ...page.results.map(r => Number(r.id) || 0)));
      return; // First activation establishes a baseline instead of announcing old requests.
    }
    requests.push(...page.results.filter(r => Number(r.id) > cursor));
    if (page.results.length < PAGE_SIZE || page.results.some(r => Number(r.id) <= cursor)) break;
    skip += PAGE_SIZE;
  }
  for (const request of requests.sort((a, b) => Number(a.id) - Number(b.id))) {
    if ([1, 2, 5].includes(Number(request.status))) {
      const media = request.media || {};
      const mediaType = media.mediaType || request.type;
      const tmdbId = id(media.tmdbId);
      if (!['movie', 'tv'].includes(mediaType) || !tmdbId) throw new Error('Invalid Seerr request media');
      const details = await get(`${mediaType}/${tmdbId}`, { language: 'fr' });
      await store.enqueue({
        event: 'request', requestId: id(request.id), mediaType, tmdbId,
        title: text(details.title || details.name) || 'Titre inconnu',
        year: id((details.releaseDate || details.firstAirDate || '').slice(0, 4)),
        requester: text(request.requestedBy?.displayName || request.requestedBy?.plexUsername || request.requestedBy?.username) || 'Utilisateur inconnu',
        seasons: (request.seasons || []).map(s => s.seasonNumber).join(', '),
        overview: text(details.overview, 1500),
      });
    }
    // Advance only after durable enqueue; duplicate retries cannot send a second message.
    await store.setRequestCursor(Number(request.id));
  }
}
module.exports = { poll, INTERVAL_MS };

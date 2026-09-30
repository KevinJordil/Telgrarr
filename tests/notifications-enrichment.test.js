import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config');
const { enrich } = require('../src/notifications/enrichment');
let get;
beforeEach(() => {
  config.tautulli = { baseUrl: '', apiKey: '' };
  config.radarr = { baseUrl: 'http://radarr.test', apiKey: 'test-key' };
  config.sonarr = { baseUrl: '', apiKey: '' };
  config.seerr = { baseUrl: 'http://seerr.test', apiKey: 'test-key' };
  config.tmdb = { apiKey: '' };
  get = vi.spyOn(axios, 'get');
});
afterEach(() => vi.restoreAllMocks());
const event = { event: 'available', mediaType: 'movie', tmdbId: '42', title: 'A film', resolution: '1080', codec: 'h264' };
describe('Notification origin and media enrichment', () => {
  it('uses associated Seerr requests before list tags and preserves the quality', async () => {
    get.mockImplementation(async (url) => {
      if (url.includes('/api/v3/movie')) return { data: [{ id: 1, tmdbId: 42, tags: [7], movieFile: { quality: { quality: { name: 'WEBDL-1080p' } } } }] };
      if (url.includes('/api/v1/movie')) return { data: { mediaInfo: { requests: [{ status: 5, requestedBy: { displayName: 'Camille' } }, { status: 3, requestedBy: { displayName: 'Declined' } }] } } };
      throw new Error('unexpected request');
    });
    const result = await enrich(event);
    expect(result.origin).toBe('Demande Seerr — Camille');
    expect(event.origin).toBeUndefined();
    expect(result.quality).toBe('WEBDL-1080p · H264');
    expect(get.mock.calls.every(([, options]) => options.headers['X-Api-Key'] === 'test-key')).toBe(true);
  });
  it('labels an import-list tag as probable rather than certain', async () => {
    get.mockImplementation(async (url) => {
      if (url.includes('/api/v3/movie')) return { data: [{ id: 1, tmdbId: 42, tags: [7] }] };
      if (url.includes('/api/v1/movie')) return { data: { mediaInfo: { requests: [] } } };
      if (url.includes('/importlist')) return { data: [{ enabled: true, name: 'Films récents', tags: [7] }, { enabled: false, name: 'Disabled', tags: [7] }] };
      if (url.includes('/tag')) return { data: [{ id: 7, label: 'recent' }] };
      throw new Error('unexpected request');
    });
    expect((await enrich(event)).origin).toBe('Liste Radarr probable — Films récents');
  });
  it('honors the existing Radarr blacklist when the media is identified', async () => {
    const blacklist = require('../src/blacklist');
    vi.spyOn(blacklist, 'isIdBlacklisted').mockReturnValue(true);
    get.mockResolvedValue({ data: [{ id: 1, tmdbId: 42, tags: [] }] });
    const result = await enrich(event);
    expect(result.suppressed).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('keeps availability usable when optional enrichment services fail', async () => {
    get.mockRejectedValue(new Error('private URL and credentials'));
    const result = await enrich(event);
    expect(result.origin).toBeFalsy();
    expect(result.enrichmentNotes).toContain('seerr-unavailable');
    expect(JSON.stringify(result)).not.toContain('credentials');
  });
  it('resolves series IDs from parent metadata rather than episode IDs', async () => {
    config.tautulli = { baseUrl: 'http://tautulli.test', apiKey: 'test-key' };
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'test-key' };
    get.mockImplementation(async (url, options) => {
      if (url.includes('tautulli') && options.params.rating_key === '56') return { data: { response: { result: 'success', data: { title: 'Episode', grandparent_rating_key: '10', parent_media_index: '2', media_index: '3', guids: ['tmdb://999'], media_info: [{ video_resolution: '1080', video_codec: 'h264' }] } } } };
      if (url.includes('tautulli')) return { data: { response: { result: 'success', data: { title: 'Une série', year: '2026', guids: ['tmdb://42', 'tvdb://77'], summary: 'Résumé français' } } } };
      if (url.includes('/series')) return { data: [{ id: 1, tvdbId: 77 }] };
      if (url.includes('/episodefile')) return { data: { quality: { quality: { name: 'WEBDL-1080p' } } } };
      if (url.includes('/episode')) return { data: [{ seasonNumber: 2, episodeNumber: 3, episodeFileId: 4 }] };
      if (url.includes('seerr')) return { data: { mediaInfo: { requests: [] } } };
      throw new Error('unexpected request');
    });
    const result = await enrich({ event: 'available', mediaType: 'episode', ratingKey: '56' });
    expect(result.tmdbId).toBe('42');
    expect(result.seriesTitle).toBe('Une série');
    expect(result.overview).toBe('Résumé français');
    expect(result.quality).toContain('WEBDL-1080p');
  });
});

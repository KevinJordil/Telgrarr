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
    expect(get.mock.calls.filter(([url]) => url.includes('/api/v3/movie'))).toHaveLength(1);
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

describe('Poster and IMDb enrichment', () => {
  it('falls back to the TMDb poster when Seerr metadata fails for a request', async () => {
    config.tmdb = { apiKey: 'test-tmdb-key' };
    get.mockImplementation(async url => {
      if (url.includes('api.themoviedb.org/3/movie/42/videos')) return { data: { results: [] } };
      if (url.includes('api.themoviedb.org/3/movie/42')) return { data: { poster_path: '/fallback.jpg', title: 'Un film' } };
      throw new Error('Seerr unavailable');
    });
    const result = await enrich({ ...event, event: 'request' });
    expect(result.posterUrl).toBe('https://image.tmdb.org/t/p/w500/fallback.jpg');
    expect(result.enrichmentNotes).toContain('seerr-unavailable');
  });
  it('preserves a Seerr poster and rejects malformed TMDb poster paths', async () => {
    config.tmdb = { apiKey: 'test-tmdb-key' };
    get.mockImplementation(async url => ({ data: url.includes('seerr.test') ? { posterPath: '/seerr.jpg' } : { poster_path: '/bad.jpg?api_key=private' } }));
    expect((await enrich({ ...event, event: 'request' })).posterUrl).toBe('https://image.tmdb.org/t/p/w500/seerr.jpg');
    get.mockImplementation(async url => {
      if (url.includes('seerr.test')) throw new Error('Seerr unavailable');
      return { data: { poster_path: '/bad.jpg?api_key=private' } };
    });
    expect((await enrich({ ...event, event: 'request' })).posterUrl).toBeFalsy();
  });

  it('uses the public poster and explicitly identified IMDb score, never the TMDb score', async () => {
    get.mockImplementation(async url => {
      if (url.includes('ratingscombined')) return { data: { imdb: { criticsScore: 7.3 } } };
      if (url.includes('/api/v1/movie')) return { data: { posterPath: '/poster.jpg', voteAverage: 9.9 } };
      return { data: [] };
    });
    const result = await enrich({ ...event, event: 'request' });
    expect(result.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(result.imdbRating).toBe('7,3');
  });
  it('does not mislabel unqualified Sonarr or TMDb ratings as IMDb', async () => {
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'test-key' };
    get.mockImplementation(async url => ({ data: url.includes('/series') ? [{ tmdbId: 42, ratings: { value: 8.1 } }] : { voteAverage: 8.6 } }));
    const result = await enrich({ ...event, mediaType: 'show' });
    expect(result.imdbRating).toBe('');
  });
});

describe('Season batches', () => {
  it.each([
    ['1-3', true, [true, true, true]],
    ['1-2', false, [true, true, true]],
    ['1-3', false, [true, true, false]],
  ])('verifies the batch %s against known episodes and files', async (range, complete, hasFiles) => {
    config.sonarr = { baseUrl: 'http://sonarr.test', apiKey: 'test-key' };
    get.mockImplementation(async url => {
      if (url.includes('/series')) return { data: [{ id: 1, tmdbId: 42 }] };
      if (url.includes('/episodefile')) return { data: [1,2,3].map(id => ({ id, quality: { quality: { name: id === 3 ? 'Bluray-1080p' : 'WEBDL-1080p' } } })) };
      if (url.includes('/episode')) return { data: [1,2,3].map((n,i) => ({ seasonNumber: 2, episodeNumber: n, episodeFileId: n, hasFile: hasFiles[i] })) };
      return { data: {} };
    });
    const result = await enrich({ ...event, mediaType: 'season', season: '2', episodeRange: range });
    expect(result.seasonComplete).toBe(complete);
    expect(result.seasonEpisodeCount).toBe('3');
    expect(result.addedEpisodeCount).toBe(range === '1-3' ? '3' : '2');
    expect(result.quality).toContain('WEBDL-1080p');
    if (range === '1-3') expect(result.quality).toContain('Bluray-1080p');
  });
  it('rejects malformed or unbounded episode ranges', () => {
    const { rangeNumbers } = require('../src/notifications/enrichment');
    expect(rangeNumbers('1-3,5')).toEqual([1,2,3,5]);
    expect(rangeNumbers('1-999999')).toEqual([]);
    expect(rangeNumbers('3-1')).toEqual([]);
  });
});

describe('Series IMDb rating', () => {
  it.each(['tv', 'show', 'season', 'episode'])('uses the overall series ID for %s', async mediaType => {
    const imdb = require('../src/notifications/imdb');
    const lookup = vi.spyOn(imdb, 'lookup').mockResolvedValue(8.1);
    get.mockImplementation(async url => ({ data: url.includes('/api/v1/tv/') ? { externalIds: { imdbId: 'tt13210838' } } : [] }));
    const result = await enrich({ ...event, mediaType, event: mediaType === 'tv' ? 'request' : 'available' });
    expect(lookup).toHaveBeenCalledWith('tt13210838');
    expect(result.imdbRating).toBe('8,1');
  });
  it('ignores the episode IMDb GUID and uses its parent series GUID', async () => {
    config.tautulli = { baseUrl: 'http://tautulli.test', apiKey: 'test-key' };
    const imdb = require('../src/notifications/imdb');
    const lookup = vi.spyOn(imdb, 'lookup').mockResolvedValue(8.1);
    get.mockImplementation(async (url, options) => {
      if (url.includes('tautulli') && options.params.rating_key === '56') return { data: { response: { result: 'success', data: { grandparent_rating_key: '10', guids: ['imdb://tt999999'], audience_rating: '9.9', audience_rating_image: 'imdb://image.rating' } } } };
      if (url.includes('tautulli')) return { data: { response: { result: 'success', data: { title: 'Une série', guids: ['imdb://tt13210838'] } } } };
      return { data: [] };
    });
    expect((await enrich({ event: 'available', mediaType: 'episode', ratingKey: '56' })).imdbRating).toBe('8,1');
    expect(lookup).toHaveBeenCalledWith('tt13210838');
  });
});

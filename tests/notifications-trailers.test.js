import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const config = require('../src/config');
const axios = require('axios');
const { choose, trailers } = require('../src/notifications/trailers');
const french = { site: 'YouTube', type: 'Trailer', key: 'abcdef12345', name: 'Bande-annonce officielle VF' };
beforeEach(() => { config.notifications.trailersEnabled = true; config.tmdb.apiKey = ''; });
afterEach(() => vi.restoreAllMocks());
describe('French YouTube trailers', () => {
  it('excludes English fallbacks, VOSTFR, teasers and unsafe video identifiers', () => {
    expect(choose([{ ...french, name: 'Official Trailer' }, { ...french, name: 'Bande-annonce VOSTFR' }, { ...french, type: 'Teaser' }, { ...french, key: 'javascript:' }])).toBeUndefined();
    expect(choose([{ ...french, iso_639_1: 'en' }])).toBeUndefined();
    expect(choose([french])).toEqual(french);
  });
  it('uses only a trailer explicitly associated with the requested season', async () => {
    const details = { relatedVideos: [french, { ...french, name: 'Bande-annonce VF saison 1' }, { ...french, key: 'season23456', name: 'Bande-annonce VF saison 2' }] };
    const result = await trailers({ mediaType: 'episode', seriesTitle: 'Une série', season: '2' }, details);
    expect(result[0].url).toBe('https://www.youtube.com/watch?v=season23456');
    expect(result[0].isSearch).toBe(false);
    expect(result[0].label).toContain('saison 2');
  });
  it('uses the French videos endpoint of the exact season when TMDb is configured', async () => {
    config.tmdb.apiKey = 'private-test-key';
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { results: [{ ...french, name: 'Official Trailer', iso_639_1: 'fr' }] } });
    const result = await trailers({ mediaType: 'season', tmdbId: '42', season: '2' }, {});
    expect(get.mock.calls[0][0]).toBe('https://api.themoviedb.org/3/tv/42/season/2/videos');
    expect(result[0].isSearch).toBe(false);
  });
  it('labels a missing trailer as a search and does not substitute a generic series trailer', async () => {
    const result = await trailers({ mediaType: 'tv', title: 'Une série & amis', seasons: '2, 3' }, { relatedVideos: [french] });
    expect(result).toHaveLength(2);
    expect(result.every(v => v.isSearch && v.url.startsWith('https://www.youtube.com/results?'))).toBe(true);
    expect(decodeURIComponent(result[0].url)).toContain('Une série & amis saison 2');
    expect(result[0].label).toContain('Rechercher');
  });
  it('keeps film trailers usable and supports disabling trailer links', async () => {
    expect((await trailers({ mediaType: 'movie', title: 'Un film' }, { relatedVideos: [french] }))[0].isSearch).toBe(false);
    config.notifications.trailersEnabled = false;
    expect(await trailers({ mediaType: 'movie' }, {})).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Pure function — no I/O, no DI needed. Requires queue.js which loads config+logger;
// the existing queue suites already prove that path, so this require is safe in isolation.
const { identityKey } = require('../src/queue.js');

describe('queue.identityKey export (STEP 2.2 / R02 / C-IDENTITY)', () => {

  it('is exported as a function', () => {
    expect(typeof identityKey).toBe('function');
  });

  describe('sonarr identity shapes', () => {
    it('seriesId + episodeId → sonarr:<seriesId>:eid:<episodeId>', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 42, episodeId: 7 }))
        .toBe('sonarr:42:eid:7');
    });

    it('seriesId + seasonNumber + episodeNumber (no episodeId) → sonarr:<seriesId>:s<S>e<E>', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 42, seasonNumber: 3, episodeNumber: 9 }))
        .toBe('sonarr:42:s3e9');
    });

    it('episodeId takes priority over season/episode when both are present', () => {
      expect(identityKey({
        source: 'sonarr', seriesId: 42, episodeId: 7,
        seasonNumber: 3, episodeNumber: 9
      })).toBe('sonarr:42:eid:7');
    });

    it('seriesId alone (no episodeId, no season/episode) → null', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 42 })).toBeNull();
    });

    it('seriesId + only seasonNumber (episodeNumber missing) → null', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 42, seasonNumber: 3 })).toBeNull();
    });

    it('seriesId + only episodeNumber (seasonNumber missing) → null', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 42, episodeNumber: 9 })).toBeNull();
    });

    it('missing seriesId → null', () => {
      expect(identityKey({ source: 'sonarr', episodeId: 7 })).toBeNull();
    });

    it('seriesId === 0 is a valid identity (!= null, not falsy)', () => {
      expect(identityKey({ source: 'sonarr', seriesId: 0, episodeId: 0 }))
        .toBe('sonarr:0:eid:0');
    });
  });

  describe('radarr identity shape', () => {
    it('movieId → radarr:<movieId>', () => {
      expect(identityKey({ source: 'radarr', movieId: 99 })).toBe('radarr:99');
    });

    it('missing movieId → null', () => {
      expect(identityKey({ source: 'radarr' })).toBeNull();
    });

    it('movieId === 0 is a valid identity', () => {
      expect(identityKey({ source: 'radarr', movieId: 0 })).toBe('radarr:0');
    });
  });

  describe('null guards', () => {
    it('null / undefined / non-object → null', () => {
      expect(identityKey(null)).toBeNull();
      expect(identityKey(undefined)).toBeNull();
      expect(identityKey('string')).toBeNull();
      expect(identityKey(42)).toBeNull();
      expect(identityKey(true)).toBeNull();
    });

    it('unknown source → null', () => {
      expect(identityKey({ source: 'emby', id: 1 })).toBeNull();
      expect(identityKey({ source: 'unknown', seriesId: 1, episodeId: 2 })).toBeNull();
    });

    it('missing source → null', () => {
      expect(identityKey({ seriesId: 1, episodeId: 2 })).toBeNull();
    });
  });
});

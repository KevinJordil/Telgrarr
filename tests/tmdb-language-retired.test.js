import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const tmdb = require('../src/tmdb.js');
const schema = require('../src/settings-schema.js');

describe('tmdb.language retirement', () => {
  afterEach(() => vi.restoreAllMocks());
  it('schema drops the tmdb.language field and TMDB_LANGUAGES export', () => {
    expect(schema.TMDB_LANGUAGES).toBeUndefined();
    const tmdbSection = schema.SETTINGS_SCHEMA.find((s) => s.id === 'tmdb');
    expect(tmdbSection).toBeTruthy();
    expect(tmdbSection.fields.some((f) => f.key === 'tmdb.language')).toBe(false);
  });
  it('getTmdbMovieById defaults locale to en-US when no override is passed', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { id: 1 } });
    await tmdb.getTmdbMovieById(1);
    expect(axios.get.mock.calls[0][1].params.language).toBe('en-US');
  });
});

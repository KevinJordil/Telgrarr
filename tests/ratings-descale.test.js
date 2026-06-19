import { describe, it, expect } from 'vitest';
import { enrichRadarrMedia } from '../src/services/media-enricher';
import { resolveRating } from '../src/utils/media-utils';

// P1.1 / DEC-5 (WS4): ratings de-scale — the four format fns drop the scale
// suffix and emit the bare value. The parens/RTL isolates live in the TEMPLATE
// and are untouched here. DEC-2: an absent rating resolves falsy so the renderer
// omits it. resolveRating is used as its own oracle (fed a bare fmt) so these
// assertions make NO assumption about its internal numeric formatting.

const tmdb = { vote_average: 0, genres: [{ name: 'Action' }], overview: 'x' };
const mk = (ratings) => ({ id: 1, title: 'Test Movie', tmdbId: 555, ratings });

describe('ratings de-scale (P1.1 / DEC-5)', () => {
  it('imdb/tmdb/rt/mc emit bare values (no /10, %, /100)', async () => {
    const { ratings } = await enrichRadarrMedia(
      mk({ imdb:{value:7.5}, tmdb:{value:8}, rottenTomatoes:{value:85}, metacritic:{value:70} }),
      tmdb, null, 'default_en'
    );
    expect(ratings.imdb).toBe(resolveRating(7.5, 0, v => `${v}`));
    expect(ratings.tmdb).toBe(resolveRating(8, 0, v => `${v}`));
    expect(ratings.rottenTomatoes).toBe(resolveRating(85, 0, v => `${v}`));
    expect(ratings.metacritic).toBe(resolveRating(70, 0, v => `${v}`));
    for (const k of ['imdb','tmdb','rottenTomatoes','metacritic']) {
      expect(String(ratings[k])).not.toMatch(/\/10$|%$|\/100$/);
    }
  });

  it('absent rating resolves falsy → omitted (DEC-2)', async () => {
    const { ratings } = await enrichRadarrMedia(
      mk({ imdb:{value:7.5} }), tmdb, null, 'default_en'
    );
    expect(ratings.imdb).toBe(resolveRating(7.5, 0, v => `${v}`));
    expect(ratings.rottenTomatoes).toBe(resolveRating(undefined, 0, v => `${v}`));
    expect(ratings.metacritic).toBe(resolveRating(undefined, 0, v => `${v}`));
    expect(ratings.rottenTomatoes).toBeFalsy();
    expect(ratings.metacritic).toBeFalsy();
  });
});

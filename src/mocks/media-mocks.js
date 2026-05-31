'use strict';

const MOCK_SONARR = {
  series: {
    title: 'Breaking Bad', genres: ['Drama', 'Crime'], year: 2008,
    status: 'Ended', imdbId: 'tt0903747', runtime: 47, tmdbId: 1396
  },
  single: [{ episodeNumber: 7, seasonNumber: 3, _runtimeMinutes: 47 }],
  multi: [
    { episodeNumber: 1, seasonNumber: 3 }, { episodeNumber: 2, seasonNumber: 3 },
    { episodeNumber: 6, seasonNumber: 3 }, { episodeNumber: 7, seasonNumber: 3 }
  ],
  multiseason: [
    { episodeNumber: 1, seasonNumber: 1 }, { episodeNumber: 1, seasonNumber: 2 }
  ]
};

const MOCK_RADARR = {
  movie: {
    title: 'Inception', year: 2010, genres: ['Action', 'Sci-Fi'],
    runtime: 148, imdbId: 'tt1375666', tmdbId: 27205
  },
  tmdb: {
    overview: 'A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a CEO.',
    runtime: 148, vote_average: 8.8, imdb_id: 'tt1375666'
  },
  ratings: {
    imdb:           '8.8/10',
    tmdb:           '8.4/10',
    rottenTomatoes: '87%',
    metacritic:     '74/100',
  },
};

module.exports = { MOCK_SONARR, MOCK_RADARR };

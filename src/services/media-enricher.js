'use strict';
const config = require('../config');
const log    = require('../logger');
const { get: getFromCache, set: setToCache } = require('../media-cache');
const { translateText } = require('../translator');
const { translateGenres, translateStatus } = require('../genres');
const { attachSeerr, resolveRating } = require('../utils/media-utils');

async function enrichSonarrMedia(rawSeries, rawTmdbSeries = null, rawOmdbData = null, activeMode = null) {
  const series = attachSeerr(rawSeries, 'tv');
  const rawGenres = (series.genres || []).slice(0, 2);
  series._genresAr = translateGenres(rawGenres).join(' • ') || null;
  series._genresEn = rawGenres.length > 0 ? rawGenres.join(' • ') : null;
  series._statusAr = translateStatus(series.status);
  series._statusEn = series.status
    ? series.status.charAt(0).toUpperCase() + series.status.slice(1).toLowerCase()
    : null;
  // Sonarr plot cascade (TMDb-TV -> OMDb -> Sonarr own), gated on sonarr.includePlot.
  const includePlot = config.sonarr?.includePlot !== false;
  const tmdbSeries = rawTmdbSeries || null;
  const omdbPlot = (rawOmdbData && rawOmdbData.Plot && rawOmdbData.Plot !== 'N/A') ? rawOmdbData.Plot : '';
  const rawOv = includePlot ? (((tmdbSeries && tmdbSeries.overview) || omdbPlot || series.overview || '')).trim() : '';
  const MAX_PLOT = 800;
  series._overviewEn = rawOv ? (rawOv.length > MAX_PLOT ? rawOv.substring(0, MAX_PLOT) + '...' : rawOv) : null;
  series._overviewAr = null;
  if (activeMode === 'default_ar' && rawOv) {
    const isAlreadyArabic = /[\u0600-\u06FF]/.test(rawOv);
    const plotKey = (!isAlreadyArabic && series.tmdbId) ? `plot:tv:${series.tmdbId}:${config.tmdb.language}` : null;
    let translatedOv = null;
    let plotCacheHit = false;
    if (isAlreadyArabic) {
      translatedOv = rawOv;
    } else if (plotKey) {
      translatedOv = await getFromCache(plotKey);
      if (translatedOv) plotCacheHit = true;
      else {
        translatedOv = await translateText(rawOv, { fallback: null });
        if (translatedOv) await setToCache(plotKey, translatedOv);
      }
    }
    const baseAr = translatedOv !== null ? translatedOv : rawOv;
    series._overviewAr = baseAr.length > MAX_PLOT ? baseAr.substring(0, MAX_PLOT) + '...' : baseAr;
    if (!isAlreadyArabic && translatedOv !== null) {
      series._overviewAr += '\n\n<blockquote>ترجمة ذكاء صناعي</blockquote>';
      if (!plotCacheHit) log.info('MediaEnricher', `AI Translation Pass \u2192 Plot \u2192 "${series.title}"`);
    }
  }
  return series;
}

async function enrichRadarrMedia(rawMovie, rawTmdbMovie, rawOmdbData, activeMode) {
  const movie = attachSeerr(rawMovie, 'movie');
  let tmdbMovie = rawTmdbMovie ? { ...rawTmdbMovie } : null;

  // 1. Deterministic English Field Shaping
  const includePlot = config.radarr?.includePlot !== false;
  const omdbPlot = (rawOmdbData?.Plot && rawOmdbData.Plot !== 'N/A') ? rawOmdbData.Plot : '';
  const rawOv = includePlot ? (tmdbMovie?.overview || omdbPlot || movie.overview || '').trim() : '';
  const MAX_PLOT = 800;
  if (rawOv && !tmdbMovie) tmdbMovie = {};
  if (!includePlot && tmdbMovie) tmdbMovie.overview = '';  // plot OFF: clear raw overview so renderRadarr fallback cannot leak it
  if (tmdbMovie) {
    tmdbMovie._overviewEn = rawOv.length > MAX_PLOT ? rawOv.substring(0, MAX_PLOT) + '...' : rawOv || null;
  }
  let targetGenres = [];
  if (Array.isArray(tmdbMovie?.genres) && tmdbMovie.genres.length > 0) {
    targetGenres = tmdbMovie.genres.map(g => g.name).filter(Boolean);
  } else if (Array.isArray(movie.genres) && movie.genres.length > 0) {
    targetGenres = movie.genres.filter(Boolean);
  }
  movie._genresEn = targetGenres.length > 0 ? targetGenres.join(' • ') : null;

  // 2. Ratings Resolution
  const r = movie.ratings || {};
  const omdbImdb = rawOmdbData?.imdbRating ? parseFloat(rawOmdbData.imdbRating) : 0;
  const rtRaw    = rawOmdbData?.Ratings?.find(x => x.Source === 'Rotten Tomatoes')?.Value || '';
  const mcRaw    = rawOmdbData?.Ratings?.find(x => x.Source === 'Metacritic')?.Value || '';
  const omdbRt   = rtRaw ? parseInt(rtRaw.replace('%', '')) : 0;
  const omdbMc   = mcRaw ? parseInt(mcRaw.split('/')[0]) : 0;
  const ratings = {
    imdb:           resolveRating(r.imdb?.value,           omdbImdb,                       v => `${v}/10`),
    tmdb:           resolveRating(r.tmdb?.value,           tmdbMovie?.vote_average || 0,   v => `${v}/10`),
    rottenTomatoes: resolveRating(r.rottenTomatoes?.value, omdbRt,                         v => `${v}%`),
    metacritic:     resolveRating(r.metacritic?.value,     omdbMc,                         v => `${v}/100`),
  };

  // 3. Arabic Mode Execution
  if (activeMode === 'default_ar') {
    if (rawOv) {
      const isAlreadyArabic = /[؀-ۿ]/.test(rawOv);
      const plotKey = (!isAlreadyArabic && movie.tmdbId)
        ? `plot:${movie.tmdbId}:${config.tmdb.language}`
        : null;
      let translatedOv = null;
      let plotCacheHit = false;
      if (isAlreadyArabic) {
        translatedOv = rawOv;
      } else if (plotKey) {
        translatedOv = await getFromCache(plotKey);
        if (translatedOv) {
          plotCacheHit = true;
        } else {
          translatedOv = await translateText(rawOv, { fallback: null });
          if (translatedOv) await setToCache(plotKey, translatedOv);
        }
      }
      if (translatedOv !== null || rawOv !== '') {
        const baseAr = translatedOv !== null ? translatedOv : rawOv;
        tmdbMovie._overviewAr = baseAr.length > MAX_PLOT ? baseAr.substring(0, MAX_PLOT) + '...' : baseAr;
        if (!isAlreadyArabic && translatedOv !== null) {
          tmdbMovie._overviewAr += '\n\n<blockquote>ترجمة ذكاء صناعي</blockquote>';
          if (!plotCacheHit) {
            log.info('MediaEnricher', `AI Translation Pass → Plot → "${movie.title}"`);
          }
        }
      }
    }
    if (targetGenres.length > 0) {
      const needsTranslation = targetGenres.some(g => !/[؀-ۿ]/.test(g));
      if (needsTranslation) {
        const staticMapped = translateGenres(targetGenres);
        const translated = [];
        for (let i = 0; i < targetGenres.length; i++) {
          const g = targetGenres[i];
          if (staticMapped[i] !== g || /[؀-ۿ]/.test(g)) {
            translated.push(staticMapped[i]);
          } else {
            const genreKey = `genre:${g.toLowerCase().trim()}:${config.tmdb.language}`;
            const cachedGenre = await getFromCache(genreKey);
            if (cachedGenre) {
              translated.push(cachedGenre);
            } else {
              const result = await translateText(g, { fallback: g });
              if (/[؀-ۿ]/.test(result)) {
                await setToCache(genreKey, result);
              }
              translated.push(result);
            }
          }
        }
        movie._genresAr = translated.join(' • ');
      } else {
        movie._genresAr = movie._genresEn;
      }
    }
  }

  return { movie, tmdbMovie, ratings };
}

module.exports = { enrichSonarrMedia, enrichRadarrMedia };

'use strict';
const config = require('../config');
const log    = require('../logger');
const { get: getFromCache, set: setToCache } = require('../media-cache');
const { translateText, aiWatermark } = require('../translator');
const { translateGenres, translateStatus } = require('../genres');
const { attachSeerr, resolveRating } = require('../utils/media-utils');
const MAX_PLOT = 800;

// DRY (R02/QB-4): the ONE genre resolver — static map -> per-genre cache -> AI
// fallback. Used by BOTH enrichers so an unmapped genre never leaks English into
// an Arabic caption (D1). Returns the ' \u2022 '-joined AR string, or null.
async function resolveGenresAr(genres, targetLang = 'ar') {
  const list = (genres || []).filter(Boolean);
  if (list.length === 0) return null;
  const AR = /[\u0600-\u06FF]/;
  const needsTranslation = list.some(g => !AR.test(g));
  if (!needsTranslation) return list.join(' \u2022 ');
  const staticMapped = translateGenres(list);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (staticMapped[i] !== g || AR.test(g)) {
      out.push(staticMapped[i]);
    } else {
      const genreKey = `genre:${g.toLowerCase().trim()}:${targetLang}`;
      const cachedGenre = await getFromCache(genreKey);
      if (cachedGenre) {
        out.push(cachedGenre);
      } else {
        const result = await translateText(g, { fallback: g });
        if (AR.test(result)) await setToCache(genreKey, result);
        out.push(result);
      }
    }
  }
  return out.join(' \u2022 ');
}

async function enrichSonarrMedia(rawSeries, rawTmdbSeries = null, rawOmdbData = null, activeMode = null) {
  const series = attachSeerr(rawSeries, 'tv');
  const targetLang = config.translator?.targetLang || 'ar';
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
  series._overviewEn = rawOv ? (rawOv.length > MAX_PLOT ? rawOv.substring(0, MAX_PLOT) + '...' : rawOv) : null;
  series._overviewAr = null;
  if (activeMode === 'default_ar' && rawOv) {
    const isAlreadyArabic = /[\u0600-\u06FF]/.test(rawOv);
    const plotKey = (!isAlreadyArabic && series.tmdbId) ? `plot:tv:${series.tmdbId}:${targetLang}` : null;
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
      series._overviewAr += aiWatermark(targetLang);
      if (!plotCacheHit) log.info('MediaEnricher', `AI Translation Pass \u2192 Plot \u2192 "${series.title}"`);
    }
  }
  if (activeMode === 'default_ar') {
    series._genresAr = await resolveGenresAr(rawGenres, targetLang);
  }
  return series;
}

async function enrichRadarrMedia(rawMovie, rawTmdbMovie, rawOmdbData, activeMode) {
  const movie = attachSeerr(rawMovie, 'movie');
  const targetLang = config.translator?.targetLang || 'ar';
  let tmdbMovie = rawTmdbMovie ? { ...rawTmdbMovie } : null;

  // 1. Deterministic English Field Shaping
  const includePlot = config.radarr?.includePlot !== false;
  const omdbPlot = (rawOmdbData?.Plot && rawOmdbData.Plot !== 'N/A') ? rawOmdbData.Plot : '';
  const rawOv = includePlot ? (tmdbMovie?.overview || omdbPlot || movie.overview || '').trim() : '';
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
  targetGenres = targetGenres.slice(0, 2);
  movie._genresEn = targetGenres.length > 0 ? targetGenres.join(' • ') : null;

  // 2. Ratings Resolution
  const r = movie.ratings || {};
  const omdbImdb = rawOmdbData?.imdbRating ? parseFloat(rawOmdbData.imdbRating) : 0;
  const rtRaw    = rawOmdbData?.Ratings?.find(x => x.Source === 'Rotten Tomatoes')?.Value || '';
  const mcRaw    = rawOmdbData?.Ratings?.find(x => x.Source === 'Metacritic')?.Value || '';
  const omdbRt   = rtRaw ? parseInt(rtRaw.replace('%', '')) : 0;
  const omdbMc   = mcRaw ? parseInt(mcRaw.split('/')[0]) : 0;
  const ratings = {
    imdb:           resolveRating(r.imdb?.value,           omdbImdb,                       v => `${v}`),
    tmdb:           resolveRating(r.tmdb?.value,           tmdbMovie?.vote_average || 0,   v => `${v}`),
    rottenTomatoes: resolveRating(r.rottenTomatoes?.value, omdbRt,                         v => `${v}`),
    metacritic:     resolveRating(r.metacritic?.value,     omdbMc,                         v => `${v}`),
  };

  // 3. Arabic Mode Execution
  if (activeMode === 'default_ar') {
    if (rawOv) {
      const isAlreadyArabic = /[\u0600-ۿ]/.test(rawOv);
      const plotKey = (!isAlreadyArabic && movie.tmdbId)
        ? `plot:${movie.tmdbId}:${targetLang}`
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
          tmdbMovie._overviewAr += aiWatermark(targetLang);
          if (!plotCacheHit) {
            log.info('MediaEnricher', `AI Translation Pass → Plot → "${movie.title}"`);
          }
        }
      }
    }
    if (targetGenres.length > 0) {
      movie._genresAr = await resolveGenresAr(targetGenres, targetLang);
    }
  }

  return { movie, tmdbMovie, ratings };
}

module.exports = { enrichSonarrMedia, enrichRadarrMedia };

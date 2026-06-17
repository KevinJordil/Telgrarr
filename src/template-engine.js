'use strict';
const Handlebars = require('handlebars');
const {
  DEFAULT_SONARR_TEMPLATE,
  DEFAULT_RADARR_TEMPLATE,
  DEFAULT_SONARR_EN,
  DEFAULT_RADARR_EN
} = require('./templates/default-layouts');
const { aiWatermark } = require('./translator');

const TG_CAPTION_LIMIT = 1024;

// Hard-cap a rendered caption at Telegram's caption limit. DRY (R02): single
// source for the cap rule (incl. the 3-char ellipsis budget), shared by
// renderRadarr's pass-3 fallback (F.2a) and renderSonarr (F.2b). NOTE: this is
// a byte-level cut and can sever an HTML tag mid-token — a pre-existing
// limitation inherited from the original renderRadarr pass-3 truncation; a
// tag-aware truncator would belong to BOTH renderers and is out of F.2 scope.
function capToLimit(caption) {
  if (caption.length <= TG_CAPTION_LIMIT) return caption;
  return caption.substring(0, TG_CAPTION_LIMIT - 3) + '...';
}

function buildRangeString(nums) {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] !== prev + 1) {
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      start = sorted[i]; prev = sorted[i];
    } else {
      prev = sorted[i];
    }
  }
  return ranges.join('، ');
}

function buildRangeStringEn(nums) {
  return buildRangeString(nums).replace(/، /g, ', ');
}

function calcSeasonRange(episodes) {
  return buildRangeString(episodes.map(e => e.seasonNumber));
}

function calcRuntimeDual(series, episodes) {
  const runtimes = episodes
    .map(e => e._runtimeMinutes || series.runtime)
    .filter(r => r && r > 0);
  if (runtimes.length === 0) return { ar: null, en: null };
  const min = Math.min(...runtimes);
  const max = Math.max(...runtimes);
  if (min === max) return { ar: min + ' دقيقة', en: min + ' min' };
  const avg = Math.round(runtimes.reduce((s, r) => s + r, 0) / runtimes.length);
  return {
    ar: min + '-' + max + ' دقيقة (متوسط ' + avg + ' د.)',
    en: min + '-' + max + ' min (avg ' + avg + 'm)'
  };
}

function tripleSmartSwitchDual(episodes) {
  const distinctSeasons = [...new Set(episodes.map(e => e.seasonNumber))];
  if (distinctSeasons.length > 1) {
    return {
      ar: { label: 'إجمالي الحلقات:', value: String(episodes.length) },
      en: { label: 'Total Episodes:', value: String(episodes.length) }
    };
  }
  if (episodes.length === 1) {
    return {
      ar: { label: 'الحلقة:', value: String(episodes[0].episodeNumber) },
      en: { label: 'Episode:', value: String(episodes[0].episodeNumber) }
    };
  }
  return {
    ar: { label: 'الحلقات:', value: buildRangeString(episodes.map(e => e.episodeNumber)) },
    en: { label: 'Episodes:', value: buildRangeStringEn(episodes.map(e => e.episodeNumber)) }
  };
}

function formatRuntimeDual(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return { ar: null, en: null };
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return { ar: hours + ' ساعة و ' + mins + ' دقيقة', en: hours + 'h ' + mins + 'm' };
  if (hours > 0) return { ar: hours + ' ساعة', en: hours + 'h' };
  return { ar: mins + ' دقيقة', en: mins + 'm' };
}

function renderSonarr(templateString, series, episodes) {
  const isEn = templateString === 'DEFAULT_EN';
  const rawOv = ((isEn ? series._overviewEn : series._overviewAr) || series._overviewEn || '').trim();
  const epData = tripleSmartSwitchDual(episodes);
  const rtData = calcRuntimeDual(series, episodes);
  const data = {
    headerEmoji: '🎞',
    headerText: 'تمت إضافة مسلسل جديد',
    separator: '──────────────',
    title: series.title,
    genres: series._genresAr || null,
    genresEn: series._genresEn || null,
    year: series.year || '',
    statusAr: series._statusAr || null,
    status_en: series._statusEn || null,
    seasonRange: calcSeasonRange(episodes),
    epLabel: epData.ar.label,
    epValue: epData.ar.value,
    epLabel_en: epData.en.label,
    epValue_en: epData.en.value,
    runtime: rtData.ar,
    runtime_en: rtData.en,
    imdbUrl: series.imdbId ? 'https://www.imdb.com/title/' + series.imdbId + '/' : null,
    seerrUrl: series._seerrUrl || null,
  };
  let compiledString = templateString;
  if (!compiledString || compiledString === 'DEFAULT_AR') compiledString = DEFAULT_SONARR_TEMPLATE;
  else if (compiledString === 'DEFAULT_EN') compiledString = DEFAULT_SONARR_EN;
  const compile = Handlebars.compile(compiledString);
  const buildData = (ov) => ({ ...data, overview: ov || null });
  return renderWithBudget(compile, buildData, rawOv).caption;
}

function renderWithBudget(compile, buildData, rawOv) {
  let caption = compile(buildData(rawOv));
  if (caption.length <= TG_CAPTION_LIMIT) return { caption, pass: 1, length: caption.length };
  // Pass 2 — calculate exact overview budget and re-render
  const shellLength = compile(buildData('')).length;
  // F.2d: measure the overview-section PREFIX overhead empirically. With a
  // 1-char overview, the rendered template emits (shellLength + prefix + 1)
  // chars; the prefix is the '\n\n<emoji> ' wrap around {{{overview}}} (~6
  // code units for DEFAULT_AR, ~5 for DEFAULT_EN, variable for custom
  // templates). Pre-F.2d this overhead was unmodeled, so the trimmed caption
  // always ran to shellLength + overhead + budget + 3 ≈ 1030/1029 > 1024 and
  // pass 2 was unreachable. Empirical probing handles custom templates too.
  const probe = compile(buildData('X')).length;
  const overhead = probe - shellLength - 1;
  let budget = TG_CAPTION_LIMIT - shellLength - overhead - 3;
  if (budget > 20 && rawOv.length > 0) {
    const wmTag = aiWatermark();
    const hasWm = rawOv.includes(wmTag);
    let cleanText = hasWm ? rawOv.replace(wmTag, '') : rawOv;
    if (hasWm) budget -= wmTag.length;
    if (budget > 0) {
      let truncatedOv = cleanText.substring(0, budget) + '...';
      if (hasWm) truncatedOv += wmTag;
      caption = compile(buildData(truncatedOv));
      if (caption.length <= TG_CAPTION_LIMIT) return { caption, pass: 2, length: caption.length };
    }
  }
  // Pass 3 — drop overview entirely
  caption = capToLimit(compile(buildData(null)));
  return { caption, pass: 3, length: caption.length };
}

function renderRadarr(templateString, movie, tmdbMovie, ratings = {}) {
  const isEn = templateString === 'DEFAULT_EN';
  const rawOv = ((tmdbMovie && (isEn ? (tmdbMovie._overviewEn || tmdbMovie.overview) : (tmdbMovie._overviewAr || tmdbMovie.overview))) || '').trim();
  const ir = (movie.ratings && movie.ratings.imdb && movie.ratings.imdb.value) || 0;
  const tr = (movie.ratings && movie.ratings.tmdb && movie.ratings.tmdb.value) || (tmdbMovie && tmdbMovie.vote_average) || 0;
  const imdbId = movie.imdbId || (tmdbMovie && tmdbMovie.imdb_id) || '';
  const rtData = formatRuntimeDual((tmdbMovie && tmdbMovie.runtime) || movie.runtime || 0);
  let compiledString = templateString;
  if (!compiledString || compiledString === 'DEFAULT_AR') compiledString = DEFAULT_RADARR_TEMPLATE;
  else if (compiledString === 'DEFAULT_EN') compiledString = DEFAULT_RADARR_EN;
  const compile = Handlebars.compile(compiledString);
  function buildData(ov) {
    return {
      headerEmoji: '🎬',
      headerText: 'تمت إضافة فيلم جديد',
      separator: '──────────────',
      title: movie.title || 'عنوان غير متوفر',
      year: movie.year || '',
      genres: movie._genresAr || (movie.genres || []).filter(Boolean).join(' • '),
      genresEn: movie._genresEn || (movie.genres || []).filter(Boolean).join(' • '),
      overview: ov || null,
      runtime: rtData.ar,
      runtime_en: rtData.en,
      rating: ir ? { value: ir, label: 'IMDb' } : tr ? { value: tr, label: 'TMDb' } : null,
      ratings: {
        imdb:           ratings.imdb           || null,
        tmdb:           ratings.tmdb           || null,
        rottenTomatoes: ratings.rottenTomatoes || null,
        metacritic:     ratings.metacritic     || null,
      },
      imdbUrl: imdbId ? 'https://www.imdb.com/title/' + imdbId : null,
      seerrUrl: movie._seerrUrl || null,
    };
  }
  return renderWithBudget(compile, buildData, rawOv);
}

module.exports = {
  renderSonarr,
  renderRadarr,
  DEFAULT_SONARR_TEMPLATE,
  DEFAULT_RADARR_TEMPLATE,
  DEFAULT_SONARR_EN,
  DEFAULT_RADARR_EN,
};

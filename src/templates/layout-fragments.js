'use strict';
const L = require('./default-layouts');

/*
 * Splits each legacy default template into ordered per-element fragments + a fixed
 * prefix/suffix, by ASCII-anchored boundaries. Fragments are EXACT slices of the oracle
 * (QB-5/QB-6: never retyped). composeTemplate() reassembles them in descriptor order;
 * the DEFAULT order reproduces the legacy string byte-identical (the parity oracle).
 *
 * Header/title/separator live in the fixed prefix; status is nested in the year
 * fragment; the trailing zwsp is the fixed suffix — matching the legacy structure.
 * Icon/label parameterisation + finer decomposition are later sub-steps.
 */

function idx(str, needle, from) {
  const i = str.indexOf(needle, from || 0);
  if (i < 0) throw new Error('layout-fragments anchor missing: ' + needle);
  return i;
}

function assemble(str, starts) {
  for (let i = 1; i < starts.length; i++) {
    if (starts[i].start <= starts[i - 1].start) {
      throw new Error('layout-fragments cuts not ascending at ' + starts[i].key);
    }
  }
  const suffixStart = idx(str, '\n\n&#8203;');
  if (suffixStart <= starts[starts.length - 1].start) {
    throw new Error('layout-fragments suffix precedes last cut');
  }
  const prefix = str.slice(0, starts[0].start);
  const suffix = str.slice(suffixStart);
  const fragsByKey = {};
  const orderKeys = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i].start;
    const e = i + 1 < starts.length ? starts[i + 1].start : suffixStart;
    fragsByKey[starts[i].key] = str.slice(s, e);
    orderKeys.push(starts[i].key);
  }
  return { prefix, suffix, fragsByKey, orderKeys };
}

function buildRadarr(str, lang) {
  const g = lang === 'en' ? 'genresEn' : 'genres';
  const rt = lang === 'en' ? 'runtime_en' : 'runtime';
  const spec = [
    ['year', 'year'], ['genres', g], ['plot', 'overview'], ['runtime', rt],
    ['ratings.imdb', 'ratings.imdb'], ['ratings.tmdb', 'ratings.tmdb'],
    ['ratings.rottenTomatoes', 'ratings.rottenTomatoes'],
    ['ratings.metacritic', 'ratings.metacritic'],
    ['imdbLink', 'imdbUrl'], ['seerrLink', 'seerrUrl'],
  ];
  const starts = spec.map(function (p) {
    return { key: p[0], start: idx(str, '{{#if ' + p[1] + '}}') };
  });
  return assemble(str, starts);
}

function buildSonarr(str, lang) {
  const g = lang === 'en' ? 'genresEn' : 'genres';
  const rt = lang === 'en' ? 'runtime_en' : 'runtime';
  const overviewStart = idx(str, '{{#if overview}}');
  const overviewIfEnd = idx(str, '{{/if}}', overviewStart) + '{{/if}}'.length;
  const seasonTokenEnd = idx(str, '{{seasonRange}}', overviewIfEnd) + '{{seasonRange}}'.length;
  const starts = [
    { key: 'year',      start: idx(str, '{{#if year}}') },
    { key: 'genres',    start: idx(str, '{{#if ' + g + '}}') },
    { key: 'plot',      start: overviewStart },
    { key: 'season',    start: overviewIfEnd },
    { key: 'episode',   start: seasonTokenEnd },
    { key: 'runtime',   start: idx(str, '{{#if ' + rt + '}}') },
    { key: 'imdbLink',  start: idx(str, '{{#if imdbUrl}}') },
    { key: 'seerrLink', start: idx(str, '{{#if seerrUrl}}') },
  ];
  return assemble(str, starts);
}

const REGISTRY = {
  sonarr: { ar: buildSonarr(L.DEFAULT_SONARR_TEMPLATE, 'ar'), en: buildSonarr(L.DEFAULT_SONARR_EN, 'en') },
  radarr: { ar: buildRadarr(L.DEFAULT_RADARR_TEMPLATE, 'ar'), en: buildRadarr(L.DEFAULT_RADARR_EN, 'en') },
};

const DEFAULT_ORDER = {
  sonarr: REGISTRY.sonarr.ar.orderKeys.slice(),
  radarr: REGISTRY.radarr.ar.orderKeys.slice(),
};

function composeTemplate(kind, lang, order) {
  const reg = REGISTRY[kind] && REGISTRY[kind][lang];
  if (!reg) throw new Error('layout-fragments: no registry for ' + kind + '/' + lang);
  let out = reg.prefix;
  for (const key of order) {
    if (reg.fragsByKey[key] != null) out += reg.fragsByKey[key];
  }
  return out + reg.suffix;
}

module.exports = { REGISTRY, DEFAULT_ORDER, composeTemplate };

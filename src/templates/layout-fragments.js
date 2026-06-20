'use strict';
const L = require('./default-layouts');
const S = require('./layout-schema');
const CS = require('./caption-strings');

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
  return { prefix, suffix, fragsByKey, orderKeys, paramsByKey: paramize(fragsByKey) };
}


const PICTO = /\p{Extended_Pictographic}\uFE0F?/u;
function paramOne(frag) {
  const m = frag.match(PICTO);
  if (!m) throw new Error('layout-fragments: icon missing');
  const iconStart = m.index;
  const iconEnd = iconStart + m[0].length;
  if (frag.charAt(iconEnd) !== ' ') throw new Error('layout-fragments: icon space missing');
  const defaultIcon = frag.slice(iconStart, iconEnd);
  const afterIconSpace = iconEnd + 1;
  const rest = frag.slice(afterIconSpace);
  const beforeIcon = frag.slice(0, iconStart);
  let labelClass = 'none';
  let labelStart = -1, labelEnd = -1;
  if (rest.startsWith('<b>')) {
    const open = afterIconSpace + 3;
    const b1 = frag.indexOf('</b>', open);
    if (b1 < 0) throw new Error('layout-fragments: <b> unterminated');
    if (frag.slice(open, b1).indexOf('{{') < 0) { labelClass = 'bold'; labelStart = open; labelEnd = b1; }
  } else if (rest.startsWith('<a ')) {
    const close = frag.indexOf('">', afterIconSpace);
    const a1 = close < 0 ? -1 : frag.indexOf('</a>', close);
    if (close < 0 || a1 < 0) throw new Error('layout-fragments: anchor malformed');
    labelClass = 'anchor'; labelStart = close + 2; labelEnd = a1;
  } else if (!rest.startsWith('{{')) {
    let v = frag.indexOf('\u2066(', afterIconSpace);
    if (v < 0) {
      v = frag.indexOf('{{', afterIconSpace);
      if (v > 0 && frag.charAt(v - 1) === '\u2066') v -= 1;
    }
    if (v < 1 || frag.charAt(v - 1) !== ' ') throw new Error('layout-fragments: plain label boundary');
    labelClass = 'plain'; labelStart = afterIconSpace; labelEnd = v - 1;
  }
  const hasLabel = labelClass !== 'none';
  if (!hasLabel) {
    return { beforeIcon, defaultIcon, hasLabel: false, labelClass: 'none', noLabelBody: frag.slice(iconEnd + 1) };
  }
  const mid = frag.slice(afterIconSpace, labelStart);
  const defaultLabel = frag.slice(labelStart, labelEnd);
  const afterLabel = frag.slice(labelEnd);
  let emptyBody;
  if (labelClass === 'plain') {
    if (afterLabel.charAt(0) !== ' ') throw new Error('layout-fragments: plain sep');
    emptyBody = afterLabel.slice(1);
  } else if (labelClass === 'bold') {
    if (!afterLabel.startsWith('</b> ')) throw new Error('layout-fragments: bold close');
    emptyBody = afterLabel.slice(5);
  } else {
    emptyBody = mid + afterLabel;
  }
  return { beforeIcon, defaultIcon, hasLabel: true, labelClass, mid, defaultLabel, afterLabel, emptyBody };
}
function paramize(fragsByKey) {
  const out = {};
  for (const key of Object.keys(fragsByKey)) out[key] = paramOne(fragsByKey[key]);
  return out;
}
function renderFragment(param, key, iconOverride, labelOverride) {
  let iconGlyph = param.defaultIcon;
  let iconNone = false;
  if (iconOverride != null) {
    if (iconOverride === S.ICON_NONE) iconNone = true;
    else if (S.isValidIcon(iconOverride, key)) iconGlyph = iconOverride;
  }
  let body;
  if (!param.hasLabel) {
    body = param.noLabelBody;
  } else {
    let useLabel = param.defaultLabel;
    let empty = false;
    if (labelOverride != null) {
      const norm = S.normalizeLabel(labelOverride);
      if (norm === '') empty = true;
      else useLabel = S.escapeLabel(norm);
    }
    body = empty ? param.emptyBody : (param.mid + useLabel + param.afterLabel);
  }
  return iconNone ? (param.beforeIcon + body) : (param.beforeIcon + iconGlyph + ' ' + body);
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

// buildLtrTemplate: derive an es/fr/de/pt template from the EN template (LTR
// structure) — swap header + descriptive labels to the target (caption-strings
// leaf, R02/QB-4) and swap the *_en value tokens to the BASE tokens so the
// engine's render-lang base values feed in. Ratings labels (brand) + value
// isolates are inherited from EN unchanged. en/ar registries are NOT touched.
function buildLtrTemplate(enStr, kind, lang) {
  const en = CS.captionStrings('en');
  const cs = CS.captionStrings(lang);
  let s = enStr;
  s = s.replaceAll(en.header[kind], cs.header[kind]);
  s = s.replaceAll('{{#if genresEn}}', '{{#if genres}}').replaceAll('{{genresEn}}', '{{genres}}');
  s = s.replaceAll('{{#if runtime_en}}', '{{#if runtime}}').replaceAll('{{runtime_en}}', '{{runtime}}');
  s = s.replaceAll('{{#if status_en}}', '{{#if statusAr}}').replaceAll('{{status_en}}', '{{statusAr}}');
  s = s.replaceAll('{{epLabel_en}}', '{{epLabel}}').replaceAll('{{epValue_en}}', '{{epValue}}');
  s = s.replaceAll('<b>' + en.labels.year + '</b>', '<b>' + cs.labels.year + '</b>');
  s = s.replaceAll('<b>' + en.labels.season + '</b>', '<b>' + cs.labels.season + '</b>');
  s = s.replaceAll('<b>' + en.labels.runtime + '</b>', '<b>' + cs.labels.runtime + '</b>');
  s = s.replaceAll('>' + en.labels.imdbLink + '</a>', '>' + cs.labels.imdbLink + '</a>');
  s = s.replaceAll('>' + en.labels.seerrLink + '</a>', '>' + cs.labels.seerrLink + '</a>');
  return s;
}

const REGISTRY = {
  sonarr: { ar: buildSonarr(L.DEFAULT_SONARR_TEMPLATE, 'ar'), en: buildSonarr(L.DEFAULT_SONARR_EN, 'en') },
  radarr: { ar: buildRadarr(L.DEFAULT_RADARR_TEMPLATE, 'ar'), en: buildRadarr(L.DEFAULT_RADARR_EN, 'en') },
};

for (const _lang of ['es', 'fr', 'de', 'pt']) {
  REGISTRY.sonarr[_lang] = buildSonarr(buildLtrTemplate(L.DEFAULT_SONARR_EN, 'sonarr', _lang), _lang);
  REGISTRY.radarr[_lang] = buildRadarr(buildLtrTemplate(L.DEFAULT_RADARR_EN, 'radarr', _lang), _lang);
}

const DEFAULT_ORDER = {
  sonarr: REGISTRY.sonarr.ar.orderKeys.slice(),
  radarr: REGISTRY.radarr.ar.orderKeys.slice(),
};

function composeTemplate(kind, lang, order) {
  const reg = REGISTRY[kind] && REGISTRY[kind][lang];
  if (!reg) throw new Error('layout-fragments: no registry for ' + kind + '/' + lang);
  let out = reg.prefix;
  for (const item of order) {
    const d = typeof item === 'string' ? { key: item } : (item || {});
    if (d.enabled === false) continue;
    const key = d.key;
    if (reg.fragsByKey[key] == null) continue;
    out += renderFragment(reg.paramsByKey[key], key, d.icon, d.label);
  }
  return out + reg.suffix;
}

(function verifyParamParity() {
  for (const kind of Object.keys(REGISTRY)) {
    for (const lang of Object.keys(REGISTRY[kind])) {
      const reg = REGISTRY[kind][lang];
      for (const key of reg.orderKeys) {
        if (renderFragment(reg.paramsByKey[key], key, undefined, undefined) !== reg.fragsByKey[key]) {
          throw new Error('layout-fragments: param parity drift ' + kind + '/' + lang + '/' + key);
        }
      }
    }
  }
})();

module.exports = { REGISTRY, DEFAULT_ORDER, composeTemplate };

'use strict';
/*
 * Layout element catalog + field-level rules for the structured Composer (DEC-1/2/3/4/10).
 * Zero-dep. Owns: the catalog (what elements exist, kinds, value-source), the default
 * render order per kind (DEC-10 single source of order), curated icon palettes, and the
 * field rules (label escape/cap, icon validation) imported by renderer + validator + UI
 * so there is ONE source (R02/QB-4).
 *
 * It deliberately does NOT hold concrete default DESCRIPTOR values (the exact default
 * icon grapheme + per-language label text): those are assembled in P4.2 by EXTRACTING
 * the ar/en bytes from default-layouts.js under the byte-identical parity assert, then
 * authoring es/fr/de/pt — keeping RTL/emoji bytes in one place next to their proof
 * (QB-5/QB-6). Icon palette entries below are authored via \u escapes (never retyped).
 */

// ── DEC-3: label rules ──
const LABEL_MAX = 40;
function escapeLabel(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function normalizeLabel(value) {
  const trimmed = String(value == null ? '' : value).trim();
  return [...trimmed].slice(0, LABEL_MAX).join('');
}

// ── DEC-4: icon rules ──
const ICON_NONE = 'none';
function isSingleEmoji(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const seg = new Intl.Segmenter('en', { granularity: 'grapheme' });
  if ([...seg.segment(value)].length !== 1) return false;
  return /\p{Extended_Pictographic}/u.test(value);
}

// Curated alternative icons per element (CHOICES; the current default emoji is supplied
// by the P4.2 extracted descriptor). 'none' => element renders icon-less.
const ICON_CHOICES = {
  header:                   ['\u{1F39E}', '\u{1F3AC}', '\u{1F4E2}', '\u{1F195}', ICON_NONE],
  title:                    ['\u{1F4FA}', '\u{1F3A5}', '\u{1F3AC}', '\u{1F195}', ICON_NONE],
  year:                     ['\u{1F4C6}', '\u{1F4C5}', '\u{1F5D3}', ICON_NONE],
  status:                   ['\u{1F4CA}', '\u{1F7E2}', '\u{1F3F3}', ICON_NONE],
  genres:                   ['\u{1F3AD}', '\u{1F3F7}', '\u{1F4DA}', ICON_NONE],
  plot:                     ['\u{1F4DD}', '\u{1F4D6}', '\u{1F4AC}', ICON_NONE],
  season:                   ['\u{1F4FA}', '\u{1F5C2}', '\u{1F4C1}', ICON_NONE],
  episode:                  ['\u{1F3AC}', '\u{1F39E}', '\u{1F4FD}', ICON_NONE],
  runtime:                  ['\u{23F3}',  '\u{1F553}', '\u{23F1}',  ICON_NONE],
  'ratings.imdb':           ['\u{2B50}',  '\u{1F31F}', ICON_NONE],
  'ratings.tmdb':           ['\u{1F535}', '\u{1F3AC}', ICON_NONE],
  'ratings.rottenTomatoes': ['\u{1F345}', '\u{1F3C5}', ICON_NONE],
  'ratings.metacritic':     ['\u{1F396}', '\u{1F3C6}', ICON_NONE],
  imdbLink:                 ['\u{1F517}', '\u{2197}',  ICON_NONE],
  seerrLink:                ['\u{1F517}', '\u{1F5A5}', ICON_NONE],
};

// ── Element catalog (DEC-2 present-only render; DEC-10 order is render order) ──
// source = value-source accessor hint (mirrors template-engine.js); exact wiring is P4.2.
const ELEMENT_CATALOG = [
  { key: 'header',                  kinds: ['sonarr', 'radarr'], source: 'headerEmoji + headerText' },
  { key: 'title',                   kinds: ['sonarr', 'radarr'], source: 'title' },
  { key: 'year',                    kinds: ['sonarr', 'radarr'], source: 'year' },
  { key: 'status',                  kinds: ['sonarr'],           source: '_statusAr / _status_en' },
  { key: 'genres',                  kinds: ['sonarr', 'radarr'], source: '_genresAr / _genresEn' },
  { key: 'plot',                    kinds: ['sonarr', 'radarr'], source: 'overview (_overviewAr/_overviewEn)' },
  { key: 'season',                  kinds: ['sonarr'],           source: 'seasonRange (calcSeasonRange)' },
  { key: 'episode',                 kinds: ['sonarr'],           source: 'epData.{ar,en}' },
  { key: 'runtime',                 kinds: ['sonarr', 'radarr'], source: 'rtData.{ar,en}' },
  { key: 'ratings.imdb',            kinds: ['radarr'],           source: 'ratings.imdb' },
  { key: 'ratings.tmdb',            kinds: ['radarr'],           source: 'ratings.tmdb' },
  { key: 'ratings.rottenTomatoes',  kinds: ['radarr'],           source: 'ratings.rottenTomatoes' },
  { key: 'ratings.metacritic',      kinds: ['radarr'],           source: 'ratings.metacritic' },
  { key: 'imdbLink',                kinds: ['sonarr', 'radarr'], source: 'imdbUrl (imdbId)' },
  { key: 'seerrLink',               kinds: ['sonarr', 'radarr'], source: 'seerrUrl (_seerrUrl)' },
];
const CATALOG_BY_KEY = Object.fromEntries(ELEMENT_CATALOG.map((e) => [e.key, e]));

// Default render order per kind — mirrors today's default-layouts.js sequence exactly.
// DEPRECATED (FA-54): these two exports are the FULL per-kind element catalog, not the
// renderer's orderable set, and have ZERO production consumers (git-grep verified) --
// the composer's real render-order authority is layout-fragments.js's DEFAULT_ORDER
// (orderable keys only; header/title are fixed-prefix Lock rows there, unlike their
// inclusion here). Kept only because layout-schema.test.js pins their values; do NOT
// wire these into any new render/order logic. Removal is deferred pending an explicit
// order to also touch that test (FAR v1 Roadmap F11.7; Master Section 5 note queued Phase Z).
const SONARR_DEFAULT_ORDER = [
  'header', 'title', 'year', 'status', 'genres', 'plot',
  'season', 'episode', 'runtime', 'imdbLink', 'seerrLink',
];
const RADARR_DEFAULT_ORDER = [
  'header', 'title', 'year', 'genres', 'plot', 'runtime',
  'ratings.imdb', 'ratings.tmdb', 'ratings.rottenTomatoes', 'ratings.metacritic',
  'imdbLink', 'seerrLink',
];

function isValidIcon(icon, key) {
  if (icon === ICON_NONE) return true;
  if ((ICON_CHOICES[key] || []).includes(icon)) return true;
  return isSingleEmoji(icon);
}

module.exports = {
  LABEL_MAX, ICON_NONE,
  escapeLabel, normalizeLabel, isSingleEmoji, isValidIcon,
  ICON_CHOICES, ELEMENT_CATALOG, CATALOG_BY_KEY,
  SONARR_DEFAULT_ORDER, RADARR_DEFAULT_ORDER,
};

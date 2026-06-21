'use strict';
// Composer view-model assembler (P5c-1). ONE job (SRP): shape the gui Composer's read
// model DRY from the backend single sources — orderable order (layout-fragments
// DEFAULT_ORDER), element catalog + curated icon palettes + label cap (layout-schema),
// and the language set (languages.js). The gui fetches this; it never duplicates the
// catalog (R02). Authoritative validation stays server-side (templates.setLayout ->
// normalizeLayout) — this is presentation data only.
const S = require('./layout-schema');
const { DEFAULT_ORDER, REGISTRY } = require('./layout-fragments');
const { LANGUAGES } = require('../languages');

// Friendly row-heading names (presentation only; keys originate from the catalog/
// DEFAULT_ORDER, this just adds human labels). A new catalog key with no entry falls
// back to the raw key; the catalog test asserts completeness so drift is caught.
const NAMES = {
  header:                   'Header',
  title:                    'Title',
  year:                     'Year',
  status:                   'Status',
  genres:                   'Genres',
  plot:                     'Plot',
  season:                   'Season',
  episode:                  'Episode',
  runtime:                  'Runtime',
  'ratings.imdb':           'IMDb Rating',
  'ratings.tmdb':           'TMDb Rating',
  'ratings.rottenTomatoes': 'Rotten Tomatoes',
  'ratings.metacritic':     'Metacritic',
  imdbLink:                 'IMDb Link',
  seerrLink:                'Request Link',
};

function nameOf(key) { return NAMES[key] || key; }

function labelInfo(kind, key) {
  const out = {};
  for (const l of LANGUAGES) {
    const reg = REGISTRY[kind] && REGISTRY[kind][l.code];
    const p = reg && reg.paramsByKey[key];
    const editable = !!(p && p.hasLabel);
    out[l.code] = { editable, default: editable ? p.defaultLabel : '' };
  }
  return out;
}

function forKind(kind) {
  const orderKeys = DEFAULT_ORDER[kind] || [];
  const inKind = S.ELEMENT_CATALOG.filter((e) => e.kinds.includes(kind));
  const orderable = orderKeys.map((key) => ({
    key,
    name: nameOf(key),
    iconChoices: (S.ICON_CHOICES[key] || []).slice(),
    labels: labelInfo(kind, key),
  }));
  const prefix = inKind
    .filter((e) => !orderKeys.includes(e.key))
    .map((e) => ({ key: e.key, name: nameOf(e.key) }));
  return { orderable, prefix };
}

function buildCatalog() {
  return {
    languages: LANGUAGES.map((l) => ({ code: l.code, name: l.name })),
    labelMax: S.LABEL_MAX,
    iconNone: S.ICON_NONE,
    sonarr: forKind('sonarr'),
    radarr: forKind('radarr'),
  };
}

module.exports = { buildCatalog };

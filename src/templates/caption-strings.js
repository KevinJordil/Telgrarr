'use strict';
/* Per-language caption strings for the LTR target languages (en, es, fr, de, pt).
 * Single source (R02/QB-4) consumed by:
 *   - layout-fragments.js (es/fr/de/pt fragment build: header + element labels)  [P4.2e-3]
 *   - template-engine.js  (runtime + episode formatters, per render lang)         [P4.2e-2]
 *   - media-enricher.js   (status, per render lang)                               [P4.2e-2]
 * Arabic (ar) is intentionally ABSENT: it stays at its frozen oracle sources
 * (default-layouts.js ar templates, STATUS_MAP/translateStatus in genres.js, and
 * the ar branches of the engine dual-helpers) — the byte-frozen RTL baseline kept
 * until P6 (DEC-1; risk register: RTL DAMAGE). en values are authored to byte-match
 * today's output (asserted in tests); es/fr/de/pt are authored (declared-new).
 * Ratings labels are PROPER NOUNS (brand names): identical in every language.
 * Operators can override any label (DEC-3). Zero-dep leaf. */
const RATINGS = {
  'ratings.imdb': 'IMDb',
  'ratings.tmdb': 'TMDb',
  'ratings.rottenTomatoes': 'Rotten Tomatoes',
  'ratings.metacritic': 'Metacritic',
};
const CAPTION_STRINGS = {
  en: {
    header: { sonarr: 'New Series Added', radarr: 'New Movie Added' },
    labels: { year: 'Year:', season: 'Season:', runtime: 'Runtime:', imdbLink: 'IMDb Link', seerrLink: 'Server Link', ...RATINGS },
    status: { ended: 'Ended', continuing: 'Continuing', upcoming: 'Upcoming' },
    episode: { single: 'Episode:', range: 'Episodes:', multi: 'Total Episodes:' },
    runtime: { episodeUnit: 'min', episodeAvgOpen: ' (avg ', episodeAvgUnit: 'm', episodeAvgClose: ')', totalHour: 'h', totalMin: 'm', totalJoin: ' ' },
  },
  es: {
    header: { sonarr: 'Nueva serie añadida', radarr: 'Nueva película añadida' },
    labels: { year: 'Año:', season: 'Temporada:', runtime: 'Duración:', imdbLink: 'Enlace IMDb', seerrLink: 'Enlace del servidor', ...RATINGS },
    status: { ended: 'Finalizada', continuing: 'En emisión', upcoming: 'Próximamente' },
    episode: { single: 'Episodio:', range: 'Episodios:', multi: 'Episodios totales:' },
    runtime: { episodeUnit: 'min', episodeAvgOpen: ' (prom ', episodeAvgUnit: 'm', episodeAvgClose: ')', totalHour: 'h', totalMin: 'm', totalJoin: ' ' },
  },
  fr: {
    header: { sonarr: 'Nouvelle série ajoutée', radarr: 'Nouveau film ajouté' },
    labels: { year: 'Année:', season: 'Saison:', runtime: 'Durée:', imdbLink: 'Lien IMDb', seerrLink: 'Lien du serveur', ...RATINGS },
    status: { ended: 'Terminée', continuing: 'En cours', upcoming: 'À venir' },
    episode: { single: 'Épisode:', range: 'Épisodes:', multi: 'Total des épisodes:' },
    runtime: { episodeUnit: 'min', episodeAvgOpen: ' (moy ', episodeAvgUnit: 'm', episodeAvgClose: ')', totalHour: 'h', totalMin: 'm', totalJoin: ' ' },
  },
  de: {
    header: { sonarr: 'Neue Serie hinzugefügt', radarr: 'Neuer Film hinzugefügt' },
    labels: { year: 'Jahr:', season: 'Staffel:', runtime: 'Laufzeit:', imdbLink: 'IMDb-Link', seerrLink: 'Server-Link', ...RATINGS },
    status: { ended: 'Beendet', continuing: 'Laufend', upcoming: 'Demnächst' },
    episode: { single: 'Folge:', range: 'Folgen:', multi: 'Gesamtfolgen:' },
    runtime: { episodeUnit: 'min', episodeAvgOpen: ' (\u00d8 ', episodeAvgUnit: 'm', episodeAvgClose: ')', totalHour: 'h', totalMin: 'm', totalJoin: ' ' },
  },
  pt: {
    header: { sonarr: 'Nova série adicionada', radarr: 'Novo filme adicionado' },
    labels: { year: 'Ano:', season: 'Temporada:', runtime: 'Duração:', imdbLink: 'Link IMDb', seerrLink: 'Link do servidor', ...RATINGS },
    status: { ended: 'Finalizada', continuing: 'Em exibição', upcoming: 'Em breve' },
    episode: { single: 'Episódio:', range: 'Episódios:', multi: 'Total de episódios:' },
    runtime: { episodeUnit: 'min', episodeAvgOpen: ' (méd ', episodeAvgUnit: 'm', episodeAvgClose: ')', totalHour: 'h', totalMin: 'm', totalJoin: ' ' },
  },
};
const LEAF_LANGS = Object.keys(CAPTION_STRINGS);
function captionStrings(lang) {
  return CAPTION_STRINGS[lang] || null;
}
module.exports = { CAPTION_STRINGS, LEAF_LANGS, captionStrings };

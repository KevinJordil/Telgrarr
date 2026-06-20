import { describe, it, expect } from 'vitest';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const E = require('../src/template-engine.js');
const { composeTemplate, DEFAULT_ORDER } = require('../src/templates/layout-fragments.js');
const { aiWatermark } = require('../src/translator.js');
const CS = require('../src/templates/caption-strings.js');
const radarrFmt = require('../src/radarr-formatter.js');

const WM = aiWatermark('ar');
const ep = [{ seasonNumber:1, episodeNumber:3, runtime:42, title:'Ep', airDateUtc:'2021-01-01T00:00:00Z', overview:'o' }];
function series(ar,en){ return { title:'Show', year:2021, _overviewAr:ar, _overviewEn:en, _genresAr:'GA', _genresEn:'GE', _statusAr:'SA', _statusEn:'SE', imdbId:'tt1', _seerrUrl:'u' }; }
function movie(){ return { title:'Movie', year:2020, _genresAr:'GA', _genresEn:'GE', genres:['Drama'], runtime:120, imdbId:'tt2', ratings:{ imdb:{value:7.5}, tmdb:{value:8.1} }, _seerrUrl:'u' }; }
function tmdb(ar,en){ return { _overviewAr:ar, _overviewEn:en, overview:'fb', runtime:120, vote_average:8.1, imdb_id:'tt2' }; }
const ratings = { imdb:'(7.5)', tmdb:'(8.1)', rottenTomatoes:'(85)', metacritic:'(70)' };
const son=(l,s)=> E.renderSonarr(composeTemplate('sonarr',l,DEFAULT_ORDER.sonarr), s, ep, { lang:l });
const rad=(l,m,t)=> E.renderRadarr(composeTemplate('radarr',l,DEFAULT_ORDER.radarr), m, t, ratings, { lang:l }).caption;

describe('P4.2e-4c: composed dispatch is byte-identical to legacy sentinel (ar/en)', () => {
  it('sonarr ar short+truncated', () => {
    expect(son('ar', series('s '+WM,'s'))).toBe(E.renderSonarr('DEFAULT_AR', series('s '+WM,'s'), ep));
    expect(son('ar', series('Z'.repeat(2000)+WM,'e'))).toBe(E.renderSonarr('DEFAULT_AR', series('Z'.repeat(2000)+WM,'e'), ep));
  });
  it('sonarr en short+truncated', () => {
    expect(son('en', series('s '+WM,'s'))).toBe(E.renderSonarr('DEFAULT_EN', series('s '+WM,'s'), ep));
    expect(son('en', series('a','Q'.repeat(2000)))).toBe(E.renderSonarr('DEFAULT_EN', series('a','Q'.repeat(2000)), ep));
  });
  it('radarr ar short+truncated', () => {
    expect(rad('ar', movie(), tmdb('s '+WM,'s'))).toBe(E.renderRadarr('DEFAULT_AR', movie(), tmdb('s '+WM,'s'), ratings).caption);
    expect(rad('ar', movie(), tmdb('Z'.repeat(2000)+WM,'e'))).toBe(E.renderRadarr('DEFAULT_AR', movie(), tmdb('Z'.repeat(2000)+WM,'e'), ratings).caption);
  });
  it('radarr en short+truncated', () => {
    expect(rad('en', movie(), tmdb('s '+WM,'s'))).toBe(E.renderRadarr('DEFAULT_EN', movie(), tmdb('s '+WM,'s'), ratings).caption);
    expect(rad('en', movie(), tmdb('a','Q'.repeat(2000)))).toBe(E.renderRadarr('DEFAULT_EN', movie(), tmdb('a','Q'.repeat(2000)), ratings).caption);
  });
});

describe('P4.2e-4c: formatter wiring + non-mixed reachability', () => {
  it('buildMovieCaption returns a non-empty caption (wiring)', () => {
    expect(radarrFmt.buildMovieCaption(movie(), tmdb('s '+WM,'s'), ratings).caption.length).toBeGreaterThan(0);
  });
  it('es is reachable and uses the Spanish header (non-mixed structure)', () => {
    const es = rad('es', movie(), tmdb('hola','hello'));
    expect(es.length).toBeGreaterThan(0);
    expect(es.includes(CS.captionStrings('es').header.radarr)).toBe(true);
  });
});

/**
 * tests/template-engine.test.js
 *
 * Golden-master contract tests for renderSonarr and renderRadarr.
 * Freezes: renderSonarr 1024 hard-cap (F.2b) + renderRadarr 3-pass logic.
 *
 * NOTE — PASS-2 BUG (see comment block before the pass-3 tests):
 * Pass 2 is currently unreachable with the default AR/EN templates due to a
 * budget miscalculation. A separate step (F.2d) will fix it and add the
 * pass-2 test.
 */

// ESM — vitest requires import syntax; relative paths resolve from this
// file's location automatically, so no __dirname workaround is needed.
import { describe, it, expect } from 'vitest';
import { renderSonarr, renderRadarr } from '../src/template-engine.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERIES = {
  title:     'Breaking Bad',
  year:       2008,
  runtime:    47,
  imdbId:    'tt0903747',
  _genresAr: 'دراما • جريمة',
  _genresEn: 'Drama • Crime',
  _statusAr: 'منتهى',
  _statusEn: 'Ended',
  _seerrUrl:  null,
};
const EPISODES = [{ seasonNumber: 1, episodeNumber: 1, _runtimeMinutes: 47 }];

const MOVIE = {
  title:     'The Dark Knight',
  year:       2008,
  imdbId:    'tt0468569',
  _genresAr: 'أكشن • دراما • إثارة',
  _genresEn: 'Action • Drama • Thriller',
  runtime:    152,
  _seerrUrl:  null,
  ratings:   {},
};
const TMDB_MOVIE = {
  runtime:      152,
  vote_average: 9.0,
  _overviewAr:  null,
  _overviewEn:  null,
};

// ─── renderSonarr ─────────────────────────────────────────────────────────────

describe('renderSonarr', () => {
  it('returns a plain string — must never regress to a {caption,...} object', () => {
    expect(typeof renderSonarr('DEFAULT_AR', SERIES, EPISODES)).toBe('string');
    expect(typeof renderSonarr('DEFAULT_EN', SERIES, EPISODES)).toBe('string');
    expect(typeof renderSonarr(null,         SERIES, EPISODES)).toBe('string');
  });

  it('in-budget render (AR): passes through unchanged, contains title', () => {
    const out = renderSonarr('DEFAULT_AR', SERIES, EPISODES);
    expect(out.length).toBeLessThanOrEqual(1024);
    expect(out).toContain(SERIES.title);
  });

  it('in-budget render (EN): passes through unchanged, contains title', () => {
    const out = renderSonarr('DEFAULT_EN', SERIES, EPISODES);
    expect(out.length).toBeLessThanOrEqual(1024);
    expect(out).toContain(SERIES.title);
  });

  it('F.2b — over-budget (AR): hard-capped at exactly 1024 with capToLimit ellipsis', () => {
    const out = renderSonarr('DEFAULT_AR', { ...SERIES, title: 'X'.repeat(2000) }, EPISODES);
    expect(typeof out).toBe('string');
    expect(out.length).toBe(1024);
    expect(out.endsWith('...')).toBe(true);
  });

  it('F.2b — over-budget (EN): hard-capped at exactly 1024 with capToLimit ellipsis', () => {
    const out = renderSonarr('DEFAULT_EN', { ...SERIES, title: 'X'.repeat(2000) }, EPISODES);
    expect(out.length).toBe(1024);
    expect(out.endsWith('...')).toBe(true);
  });
});

// ─── renderRadarr ─────────────────────────────────────────────────────────────

describe('renderRadarr', () => {

  // ── Return-shape invariants ──────────────────────────────────────────────────

  it('always returns {caption: string, pass: number, length: number}', () => {
    const r = renderRadarr('DEFAULT_AR', MOVIE, TMDB_MOVIE, {});
    expect(typeof r.caption).toBe('string');
    expect(typeof r.pass).toBe('number');
    expect(typeof r.length).toBe('number');
  });

  it('length field always equals caption.length (AR and EN)', () => {
    const ar = renderRadarr('DEFAULT_AR', MOVIE, TMDB_MOVIE, {});
    const en = renderRadarr('DEFAULT_EN', MOVIE, TMDB_MOVIE, {});
    expect(ar.length).toBe(ar.caption.length);
    expect(en.length).toBe(en.caption.length);
  });

  // ── Pass 1 ───────────────────────────────────────────────────────────────────

  it('pass 1 (AR): short movie fits in one pass — caption ≤ 1024, contains title', () => {
    const r = renderRadarr('DEFAULT_AR', MOVIE, TMDB_MOVIE, {});
    expect(r.pass).toBe(1);
    expect(r.length).toBeLessThanOrEqual(1024);
    expect(r.caption).toContain(MOVIE.title);
  });

  it('pass 1 (EN): short movie fits in one pass — caption ≤ 1024, contains title', () => {
    const r = renderRadarr('DEFAULT_EN', MOVIE, TMDB_MOVIE, {});
    expect(r.pass).toBe(1);
    expect(r.length).toBeLessThanOrEqual(1024);
    expect(r.caption).toContain(MOVIE.title);
  });

  // ── Pass 2 — NOT TESTED: known unreachable code path ─────────────────────────
  //
  // FINDING (surfaced F.2c, queued as F.2d — separate authorized behavior change):
  //
  // The budget formula `TG_CAPTION_LIMIT - shellLength - 3` omits the template's
  // overview-section prefix overhead. For DEFAULT_AR the prefix '\n\n‏📝 '
  // is ~6 code units; for DEFAULT_EN '\n\n📝 ' is ~5. This means the trimmed
  // caption always renders to shellLength + overhead + budget + 3 ≈ 1030/1029,
  // both > 1024, so the guard `if (caption.length <= TG_CAPTION_LIMIT)` is
  // never satisfied and every over-budget movie falls directly to pass 3.
  //
  // Proposed fix (F.2d):
  //   const probe    = compile(buildData('X')).length;
  //   const overhead = probe - shellLength - 1;
  //   budget         = TG_CAPTION_LIMIT - shellLength - overhead - 3;
  //
  // This measures the real prefix for any template (custom or default) and
  // produces a pass-2 caption of exactly 1024 chars. A pass-2 test will be
  // added in F.2d once the fix is approved.

  // ── Pass 3 ───────────────────────────────────────────────────────────────────

  it('pass 3 (AR) via overview fallthrough: shell without overview, ≤ 1024, no ellipsis', () => {
    // Normal title + long overview → full render > 1024 → pass-1 fails →
    // pass-2 attempt fails (budget bug above) → pass-3 emits the no-overview
    // shell. Shell length < 1024 → capToLimit is identity → no ellipsis.
    const r = renderRadarr(
      'DEFAULT_AR',
      MOVIE,
      { ...TMDB_MOVIE, _overviewAr: 'أ'.repeat(900) },
      {}
    );
    expect(r.pass).toBe(3);
    expect(r.length).toBeLessThanOrEqual(1024);
    expect(r.caption).toContain(MOVIE.title);
    expect(r.caption).not.toContain('أ'.repeat(20)); // overview dropped
  });

  it('F.2a — pass 3 (AR) huge title: capToLimit fires — caption === 1024 with ellipsis', () => {
    // Shell itself (no overview, huge title) exceeds 1024 → capToLimit truncates.
    const r = renderRadarr(
      'DEFAULT_AR',
      { ...MOVIE, title: 'X'.repeat(1100) },
      TMDB_MOVIE,
      {}
    );
    expect(r.pass).toBe(3);
    expect(r.length).toBe(1024);
    expect(r.caption.length).toBe(1024);
    expect(r.caption.endsWith('...')).toBe(true);
  });

  it('F.2a — pass 3 (EN) huge title: capToLimit fires — caption === 1024 with ellipsis', () => {
    const r = renderRadarr(
      'DEFAULT_EN',
      { ...MOVIE, title: 'X'.repeat(1100) },
      TMDB_MOVIE,
      {}
    );
    expect(r.pass).toBe(3);
    expect(r.length).toBe(1024);
    expect(r.caption.endsWith('...')).toBe(true);
  });
});

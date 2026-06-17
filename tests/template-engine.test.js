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

  // ── Pass 2 (F.2d-fixed) ──────────────────────────────────────────────────────
  // Pre-F.2d this path was unreachable: the budget formula
  // `TG_CAPTION_LIMIT - shellLength - 3` omitted the template's overview-section
  // prefix overhead (~6 code units for DEFAULT_AR '\n\n‏📝 '; ~5 for DEFAULT_EN
  // '\n\n📝 '). F.2d now measures the overhead empirically (probe with a
  // 1-char overview) and produces a pass-2 caption of exactly 1024 chars.

  it('F.2d — pass 2 (AR): long overview trimmed to fit at exactly 1024 with ellipsis', () => {
    // Normal title + over-budget overview → pass 1 fails → pass 2 trims the
    // overview to the exact remaining budget so the caption fits at 1024.
    const r = renderRadarr(
      'DEFAULT_AR',
      MOVIE,
      { ...TMDB_MOVIE, _overviewAr: 'أ'.repeat(900) },
      {}
    );
    expect(r.pass).toBe(2);
    expect(r.length).toBe(1024);
    // Truncation marker '...' is INTERNAL to the overview section — the
    // template emits footer chars (runtime, ratings, IMDb link, &#8203;)
    // after the trimmed overview, so the caption does NOT end with '...'.
    expect(r.caption.includes('...')).toBe(true);
    expect(r.caption).toContain(MOVIE.title);
    expect(r.caption).toContain('أ'); // overview present (trimmed)
  });

  it('F.2d — pass 2 (EN): long overview trimmed to fit at exactly 1024 with ellipsis', () => {
    const r = renderRadarr(
      'DEFAULT_EN',
      MOVIE,
      { ...TMDB_MOVIE, _overviewEn: 'Y'.repeat(900) },
      {}
    );
    expect(r.pass).toBe(2);
    expect(r.length).toBe(1024);
    expect(r.caption.includes('...')).toBe(true);
    expect(r.caption).toContain(MOVIE.title);
    expect(r.caption).toContain('Y');
  });

  // ── Pass 3 ───────────────────────────────────────────────────────────────────

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

describe('renderSonarr overview (P4.4)', () => {
  it('renders _overviewEn on the EN layout', () => {
    const out = renderSonarr('DEFAULT_EN', { ...SERIES, _overviewEn: 'A chemistry teacher turns to crime.' }, EPISODES);
    expect(typeof out).toBe('string');
    expect(out).toContain('A chemistry teacher turns to crime.');
    expect(out.length).toBeLessThanOrEqual(1024);
  });
  it('renders _overviewAr on the AR layout', () => {
    const out = renderSonarr('DEFAULT_AR', { ...SERIES, _overviewAr: 'AR_PLOT_MARKER' }, EPISODES);
    expect(out).toContain('AR_PLOT_MARKER');
  });
  it('no _overview -> parity (no overview section, still a string <= 1024)', () => {
    const out = renderSonarr('DEFAULT_AR', SERIES, EPISODES);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThanOrEqual(1024);
    expect(out).toContain(SERIES.title);
  });
  it('over-budget overview trimmed, string contract kept', () => {
    const out = renderSonarr('DEFAULT_EN', { ...SERIES, _overviewEn: 'Y'.repeat(2000) }, EPISODES);
    expect(typeof out).toBe('string');
    expect(out.length).toBeLessThanOrEqual(1024);
    expect(out).toContain('Y');
  });
});

describe('renderSonarr overview fallback (P4.4-fix)', () => {
  it('non-EN template with only _overviewEn falls back to it (custom-mode parity with Radarr)', () => {
    const out = renderSonarr('DEFAULT_AR', { ...SERIES, _overviewEn: 'EN_FALLBACK_PLOT', _overviewAr: null }, EPISODES);
    expect(out).toContain('EN_FALLBACK_PLOT');
  });
  it('plot-off parity: both _overviewX null -> no overview, still a string', () => {
    const out = renderSonarr('DEFAULT_AR', { ...SERIES, _overviewEn: null, _overviewAr: null }, EPISODES);
    expect(typeof out).toBe('string');
    expect(out).not.toContain('EN_FALLBACK_PLOT');
  });
});

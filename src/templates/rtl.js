'use strict';
/*
 * RTL / bidi direction primitives for the Composer renderer (QB-6 single source, R02).
 * These are the EXACT control characters the legacy Arabic templates use, authored via
 * \u escapes (never retyped). The P4.2c renderer and any direction-aware code import
 * from here so the isolate / line-prefix / zwsp rules live in ONE place.
 */
const RLM  = '\u200F';   // RIGHT-TO-LEFT MARK  (Arabic line prefix)
const LRI  = '\u2066';   // LEFT-TO-RIGHT ISOLATE
const PDI  = '\u2069';   // POP DIRECTIONAL ISOLATE
const ZWSP = '&#8203;';  // trailing zero-width space (HTML entity form, as in templates)

function isRtl(dir) {
  return dir === 'rtl';
}

// Wrap a run in an LTR isolate (matches the legacy ⁦…⁩ around years, rating
// labels/values, IMDb/TMDb, and the server-link text).
function wrapIsolate(run) {
  return LRI + String(run == null ? '' : run) + PDI;
}

// RTL line prefix (U+200F) for rtl languages; empty for ltr.
function linePrefix(dir) {
  return isRtl(dir) ? RLM : '';
}

module.exports = { RLM, LRI, PDI, ZWSP, isRtl, wrapIsolate, linePrefix };

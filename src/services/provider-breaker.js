'use strict';
// Provider auth-failure breaker (P6.1a). Recognizes a provider key/auth failure and
// records it for the duration of ONE sweep, so the sweeper never re-hits a provider
// with a known-bad key for every item in the batch (anti-spam, Master §8). State is
// reset at each sweep start (sweeper.runSweep). Classifiers mirror the app's existing
// auth judgments (connection-tester testTmdb/testOmdb) — ONE source (QB-4/R02).
//
// TMDb bad key: HTTP 401, OR body status_code 7|10|3 (invalid / suspended / auth-failed).
// OMDb bad key: HTTP 200 with body Error matching /invalid api key/i — OMDb does NOT
//   throw for a bad key. A thrown OMDb error is transient (network/HTTP), never auth.
// Pure module: zero requires (no logger/config) — cannot form a require cycle.

const TMDB_AUTH_STATUS_CODES = [7, 10, 3];

function isTmdbAuthError(err) {
  if (!err) return false;
  const code = err.response && err.response.data && err.response.data.status_code;
  return (err.response && err.response.status === 401) || TMDB_AUTH_STATUS_CODES.includes(code);
}

function isOmdbAuthError(resData) {
  return !!(resData && resData.Error && /invalid api key/i.test(resData.Error));
}

const tripped = new Set();

function trip(provider)      { tripped.add(provider); }
function isTripped(provider) { return tripped.has(provider); }
function reset()             { tripped.clear(); }

module.exports = { isTmdbAuthError, isOmdbAuthError, trip, isTripped, reset };

'use strict';
// FA-10: pure, zero-dependency formatter for a process 'unhandledRejection'
// reason value into a single log-safe line. Extracted out of src/index.js so
// this logic is unit-testable in isolation -- index.js itself has real boot
// side effects (single-instance lock, startListener(), timers) and must
// never be required by a test (LIVE SAFETY).
//
// Replaces raw template-literal coercion (`${reason}`), which:
//   - on an Error, includes a redundant "Error: " / subclass-name prefix
//     (Error.prototype.toString), instead of the bare .message the sibling
//     uncaughtException handler already logs;
//   - on a non-null object/array, collapses to the useless "[object Object]";
//   - on a Symbol, THROWS (a TypeError inside the crash handler itself).
const util = require('util');

/**
 * @param {*} reason - the value a rejected Promise was rejected with.
 * @returns {string} a single-line, log-safe rendering of `reason`.
 */
function formatReason(reason) {
  if (reason instanceof Error) return reason.message;
  if (reason !== null && typeof reason === 'object') return util.inspect(reason);
  return String(reason);
}

module.exports = { formatReason };

'use strict';
const crypto = require('crypto');

// C.6b / S2 — short-lived, SINGLE-USE tickets for the SSE EventSource connect (browsers
// cannot set an Authorization header on EventSource). An authenticated client gets a
// ticket, opens /api/stream?ticket=..., and the server BURNS it on read. TTL comfortably
// exceeds the issue->open round-trip. In-process (single-instance, D-D), like
// rate-limit.js; a process RESTART clears all. Issuance is requireAuth-gated, so the map
// can't be sprayed by an anonymous caller; TTL + opportunistic sweep bound it regardless.

const TTL_MS   = 30 * 1000;   // 30s
const SWEEP_MS = TTL_MS;      // opportunistic prune cadence

const tickets = new Map();    // ticket -> expiresAt
let lastSweep = 0;

function maybeSweep(now) {
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const [t, exp] of tickets) {
    if (exp <= now) tickets.delete(t);
  }
}

function issue(now = Date.now()) {
  maybeSweep(now);
  const ticket = crypto.randomBytes(32).toString('hex');
  tickets.set(ticket, now + TTL_MS);
  return ticket;
}

// Single-use: a valid, unexpired ticket is deleted (burned) and returns true; anything
// else returns false (a present-but-expired ticket is cleaned up on the way out).
function consume(ticket, now = Date.now()) {
  const key = String(ticket || '');
  if (!key || !tickets.has(key)) return false;
  const exp = tickets.get(key);
  tickets.delete(key);
  return exp > now;
}

function size() { return tickets.size; }

module.exports = { issue, consume, size, TTL_MS };

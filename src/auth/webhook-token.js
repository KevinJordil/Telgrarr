'use strict';
const crypto = require('crypto');

// C.5 / S1 — webhook secret validation + log redaction. Pure (crypto only) so it is
// unit-testable without booting Express. The secret is the /hooks/<secret>/ path
// segment, compared constant-time. An empty configured secret => INVALID, i.e. the
// webhook routes are closed-by-default (D-E) until the operator sets WEBHOOK_SECRET.

function tokenValid(provided, secret) {
  if (!secret) return false;                       // unset => closed (401)
  const a = Buffer.from(String(provided == null ? '' : provided), 'utf8');
  const b = Buffer.from(String(secret), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Redact the secret path segment so the request logger never persists it:
// /hooks/<token>/sonarr -> /hooks/***/sonarr. Header-form / non-hook URLs are left as-is.
function maskHooksUrl(url) {
  return String(url == null ? '' : url)
    .replace(/(\/hooks\/)[^/?#]+(\/(?:sonarr|radarr)\b)/i, '$1***$2');
}

module.exports = { tokenValid, maskHooksUrl };

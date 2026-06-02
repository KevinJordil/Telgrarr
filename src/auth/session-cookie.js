'use strict';

// C.7 / S4 / RD-4 — httpOnly session cookie helpers. Pure (no deps) so they unit-test
// without Express. Cookie is httpOnly ALWAYS + SameSite=Lax; the Secure flag is resolved
// per-response from config.COOKIE_SECURE: 'true'/'false' force it, anything else ('auto',
// the default) ties Secure to whether the request is HTTPS (direct TLS, or a trusted
// proxy's X-Forwarded-Proto — req.secure already honors Express 'trust proxy' from C.4a).

const COOKIE_NAME = 'tg_session';

function isSecure(req, cookieSecure) {
  const v = String(cookieSecure == null ? '' : cookieSecure).trim().toLowerCase();
  if (v === 'true')  return true;
  if (v === 'false') return false;
  return !!(req && (req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https')));
}

function cookieOptions(req, cookieSecure, maxAgeMs) {
  const opts = { httpOnly: true, sameSite: 'lax', secure: isSecure(req, cookieSecure), path: '/' };
  if (maxAgeMs != null) opts.maxAge = maxAgeMs;
  return opts;
}

// Read one named cookie from the raw Cookie header (zero-dep; no cookie-parser).
function readCookie(req, name) {
  const header = req && req.headers && req.headers.cookie;
  if (!header) return undefined;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return undefined;
}

module.exports = { COOKIE_NAME, isSecure, cookieOptions, readCookie };

'use strict';

/**
 * Decide whether the SPA catch-all should serve the app shell (index.html) or a
 * 404. Returns true ONLY for genuine client-side navigations. Returns false for
 * hashed build assets (/assets/*), any unmatched /api or /hooks request
 * (FA-45), and any file-like path, so a missing static
 * file — e.g. a stale lazy-loaded chunk requested by an old tab after a rebuild
 * — gets a clean 404 instead of unparseable HTML (and a CDN cannot cache HTML
 * under an /assets/* URL). Pure + framework-agnostic (reads only req.path), so
 * it is unit-testable without booting Express. SoC: routing logic, not
 * Express-specific middleware.
 *
 * @param {{ path?: string }} req
 * @returns {boolean} true => sendFile(index.html); false => 404
 */
function shouldServeAppShell(req) {
  const p = req && req.path;
  if (typeof p !== 'string') return false;
  if (p.startsWith('/assets/')) return false;   // hashed, immutable build assets
  // FA-45: unmatched /api or /hooks request — never mask a broken API/webhook
  // route behind the SPA shell; let it 404 like any other unmatched route.
  if (p === '/api' || p.startsWith('/api/')) return false;
  if (p === '/hooks' || p.startsWith('/hooks/')) return false;
  if (/\.[a-zA-Z0-9]+$/.test(p)) return false;  // any file-like path (.js/.css/.map/.png/...)
  return true;
}

module.exports = { shouldServeAppShell };

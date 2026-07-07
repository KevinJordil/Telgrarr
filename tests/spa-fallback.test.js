import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { shouldServeAppShell } = require('../src/utils/spa-fallback.js');

describe('shouldServeAppShell (SPA fallback decision)', () => {
  it('serves the shell for real client navigations (incl. root + deep links)', () => {
    expect(shouldServeAppShell({ path: '/' })).toBe(true);
    expect(shouldServeAppShell({ path: '/blacklist' })).toBe(true);
    expect(shouldServeAppShell({ path: '/logs' })).toBe(true);
    expect(shouldServeAppShell({ path: '/settings/advanced' })).toBe(true);
  });

  it('404s a stale lazy-chunk request (the reported crash)', () => {
    expect(shouldServeAppShell({ path: '/assets/Blacklist-BbiEnekp.js' })).toBe(false);
    expect(shouldServeAppShell({ path: '/assets/Logs-OldHash.js' })).toBe(false);
  });

  it('404s any file-like path, asset-dir or not', () => {
    expect(shouldServeAppShell({ path: '/favicon.png' })).toBe(false);
    expect(shouldServeAppShell({ path: '/index-Drzm1S_p.js' })).toBe(false);
    expect(shouldServeAppShell({ path: '/styles.css' })).toBe(false);
    expect(shouldServeAppShell({ path: '/sw.js.map' })).toBe(false);
  });

  it('is defensive against a missing / non-string path', () => {
    expect(shouldServeAppShell({})).toBe(false);
    expect(shouldServeAppShell({ path: undefined })).toBe(false);
    expect(shouldServeAppShell({ path: 123 })).toBe(false);
    expect(shouldServeAppShell(null)).toBe(false);
  });

  it('404s an unmatched /api or /hooks request (FA-45)', () => {
    expect(shouldServeAppShell({ path: '/api' })).toBe(false);
    expect(shouldServeAppShell({ path: '/api/' })).toBe(false);
    expect(shouldServeAppShell({ path: '/api/foo' })).toBe(false);
    expect(shouldServeAppShell({ path: '/api/data.json' })).toBe(false);
    expect(shouldServeAppShell({ path: '/hooks' })).toBe(false);
    expect(shouldServeAppShell({ path: '/hooks/' })).toBe(false);
    expect(shouldServeAppShell({ path: '/hooks/sonarr' })).toBe(false);
  });

  it('does not false-positive on a path merely starting with the letters "api"/"hooks" (FA-45 boundary)', () => {
    expect(shouldServeAppShell({ path: '/apiary' })).toBe(true);
    expect(shouldServeAppShell({ path: '/hooks-page' })).toBe(true);
  });
});

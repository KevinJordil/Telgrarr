import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { tokenValid, maskHooksUrl } = require('../src/auth/webhook-token.js');

describe('Webhook token (C.5 / S1)', () => {
  it('unset secret is always invalid (closed-by-default)', () => {
    expect(tokenValid('anything', '')).toBe(false);
    expect(tokenValid('', '')).toBe(false);
    expect(tokenValid(undefined, '')).toBe(false);
  });

  it('accepts the exact secret, rejects wrong/empty/missing', () => {
    const s = 'super-secret-123';
    expect(tokenValid(s, s)).toBe(true);
    expect(tokenValid('wrong', s)).toBe(false);
    expect(tokenValid('', s)).toBe(false);
    expect(tokenValid(undefined, s)).toBe(false);
  });

  it('length mismatch is rejected without throwing (timing-safe guard)', () => {
    expect(tokenValid('short', 'a-much-longer-secret')).toBe(false);
  });

  it('masks the path token but preserves the rest', () => {
    expect(maskHooksUrl('/hooks/abc123/sonarr')).toBe('/hooks/***/sonarr');
    expect(maskHooksUrl('/hooks/abc123/radarr?x=1')).toBe('/hooks/***/radarr?x=1');
  });

  it('leaves non-hook and header-form URLs untouched', () => {
    expect(maskHooksUrl('/api/login')).toBe('/api/login');
    expect(maskHooksUrl('/hooks/sonarr')).toBe('/hooks/sonarr');
    expect(maskHooksUrl(undefined)).toBe('');
  });
});

describe('redactUrl (C.6 / S2)', () => {
  const { redactUrl } = require('../src/auth/webhook-token.js');
  it('redacts secret query params (token/ticket/apikey/api_key), case-insensitive', () => {
    expect(redactUrl('/api/stream?token=abc123')).toBe('/api/stream?token=***');
    expect(redactUrl('/api/stream?ticket=xyz')).toBe('/api/stream?ticket=***');
    expect(redactUrl('/x?apikey=k')).toBe('/x?apikey=***');
    expect(redactUrl('/x?api_key=k')).toBe('/x?api_key=***');
    expect(redactUrl('/x?API-KEY=k')).toBe('/x?API-KEY=***');
  });
  it('redacts only the secret among many params', () => {
    expect(redactUrl('/x?a=1&token=t&b=2')).toBe('/x?a=1&token=***&b=2');
  });
  it('also redacts the /hooks/ path token', () => {
    expect(redactUrl('/hooks/SECRET/sonarr')).toBe('/hooks/***/sonarr');
    expect(redactUrl('/hooks/SECRET/radarr?token=t')).toBe('/hooks/***/radarr?token=***');
  });
  it('leaves clean URLs untouched', () => {
    expect(redactUrl('/api/login')).toBe('/api/login');
    expect(redactUrl(undefined)).toBe('');
  });
});

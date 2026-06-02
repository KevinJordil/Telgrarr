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

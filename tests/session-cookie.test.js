import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { COOKIE_NAME, isSecure, cookieOptions, readCookie } = require('../src/auth/session-cookie.js');

describe('Session cookie (C.7 / S4 / RD-4)', () => {
  it('isSecure: explicit true/false override the request', () => {
    expect(isSecure({ secure: false, headers: {} }, 'true')).toBe(true);
    expect(isSecure({ secure: true,  headers: {} }, 'false')).toBe(false);
  });

  it("isSecure: 'auto'/default follows req.secure or X-Forwarded-Proto", () => {
    expect(isSecure({ secure: true,  headers: {} }, 'auto')).toBe(true);
    expect(isSecure({ secure: false, headers: { 'x-forwarded-proto': 'https' } }, 'auto')).toBe(true);
    expect(isSecure({ secure: false, headers: {} }, 'auto')).toBe(false);
    expect(isSecure({ secure: false, headers: {} }, '')).toBe(false);
  });

  it('cookieOptions: httpOnly + Lax + path always; maxAge optional', () => {
    const o = cookieOptions({ secure: false, headers: {} }, 'auto', 1000);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe('lax');
    expect(o.path).toBe('/');
    expect(o.maxAge).toBe(1000);
    expect(cookieOptions({ secure: false, headers: {} }, 'auto').maxAge).toBeUndefined();
  });

  it('readCookie: extracts the named cookie, ignores others/missing', () => {
    expect(readCookie({ headers: { cookie: `a=1; ${COOKIE_NAME}=tok123; b=2` } }, COOKIE_NAME)).toBe('tok123');
    expect(readCookie({ headers: {} }, COOKIE_NAME)).toBeUndefined();
    expect(readCookie({}, COOKIE_NAME)).toBeUndefined();
  });
});

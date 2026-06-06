import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateSettings } = require('../src/settings/validator.js');

// ---------------------------------------------------------------------------
// Helper: assert exactly one error on the given field with the exact message
// ---------------------------------------------------------------------------
function expectSingleError(body, field, message) {
  const errors = validateSettings(body);
  const match = errors.filter(e => e.field === field);
  expect(match.length, `expected exactly 1 error for "${field}", got ${match.length}: ${JSON.stringify(errors)}`).toBe(1);
  expect(match[0].message, `wrong message for "${field}"`).toBe(message);
}

// ---------------------------------------------------------------------------
// A.2 PARITY HARNESS — freezes exact current validator output forever
// Roadmap-mandated cases: bad port, ttlDays=0, maxEntries=9999,
// bad botToken, non-numeric chatId, ftp:// URL, empty required field.
// ---------------------------------------------------------------------------

describe('validator parity harness', () => {

  // ── NON-SCHEMA EXPLICIT BLOCK ────────────────────────────────────────────

  it('bad listenerPort — below minimum', () => {
    expectSingleError(
      { listenerPort: 80 },
      'listenerPort',
      'Must be an integer between 1025 and 65534'
    );
  });

  it('bad listenerPort — above maximum', () => {
    expectSingleError(
      { listenerPort: 70000 },
      'listenerPort',
      'Must be an integer between 1025 and 65534'
    );
  });

  it('bad listenerPort — non-integer float', () => {
    expectSingleError(
      { listenerPort: 3400.5 },
      'listenerPort',
      'Must be an integer between 1025 and 65534'
    );
  });

  // ── SCHEMA INTEGER FIELDS — generic message template ────────────────────

  it('ttlDays = 0 — below min (1)', () => {
    expectSingleError(
      { mediaCache: { ttlDays: 0 } },
      'mediaCache.ttlDays',
      'Must be an integer between 1 and 90'
    );
  });

  it('maxEntries = 9999 — above max (500)', () => {
    expectSingleError(
      { mediaCache: { maxEntries: 9999 } },
      'mediaCache.maxEntries',
      'Must be an integer between 50 and 500'
    );
  });

  // ── HARDCODED LEGACY MESSAGES (parity-critical) ──────────────────────────

  it('batchWindowMs below min — legacy hardcoded message', () => {
    expectSingleError(
      { batchWindowMs: 1000 },
      'batchWindowMs',
      'Must be between 30000 (30s) and 1800000 (30min)'
    );
  });

  it('telegram.delayMs below min — legacy hardcoded message', () => {
    expectSingleError(
      { telegram: { delayMs: 100 } },
      'telegram.delayMs',
      'Must be between 500ms and 10000ms'
    );
  });

  // ── RULE: telegramToken ──────────────────────────────────────────────────

  it('bad botToken — wrong format', () => {
    expectSingleError(
      { telegram: { botToken: 'not-a-real-token' } },
      'telegram.botToken',
      'Invalid Telegram bot token format'
    );
  });

  it('bad botToken — empty string on required field', () => {
    expectSingleError(
      { telegram: { botToken: '' } },
      'telegram.botToken',
      'Cannot be empty'
    );
  });

  // ── RULE: chatId ─────────────────────────────────────────────────────────

  it('non-numeric chatId', () => {
    expectSingleError(
      { telegram: { chatId: 'not-a-number' } },
      'telegram.chatId',
      'Must be a valid numeric chat ID'
    );
  });

  // ── RULE: url — F.4 tightened to http(s) only (parity break authorized §3) ─
  it('ftp:// URL is REJECTED on sonarr.baseUrl (F.4: http/https only)', () => {
    expectSingleError(
      { sonarr: { baseUrl: 'ftp://somehost' } },
      'sonarr.baseUrl',
      'Must be a valid URL'
    );
  });

  it('ftp:// URL is REJECTED on radarr.baseUrl (F.4: http/https only)', () => {
    expectSingleError(
      { radarr: { baseUrl: 'ftp://somehost' } },
      'radarr.baseUrl',
      'Must be a valid URL'
    );
  });

  // ── EMPTY REQUIRED FIELDS ────────────────────────────────────────────────

  it('empty sonarr.apiKey — required field', () => {
    expectSingleError(
      { sonarr: { apiKey: '   ' } },
      'sonarr.apiKey',
      'Cannot be empty'
    );
  });

  it('empty tmdb.apiKey — required field', () => {
    expectSingleError(
      { tmdb: { apiKey: '' } },
      'tmdb.apiKey',
      'Cannot be empty'
    );
  });

  it('empty radarr.apiKey — required field', () => {
    expectSingleError(
      { radarr: { apiKey: '' } },
      'radarr.apiKey',
      'Cannot be empty'
    );
  });

  // ── SELECT FIELD ─────────────────────────────────────────────────────────

  it('invalid logging.level value', () => {
    expectSingleError(
      { logging: { level: 'debug' } },
      'logging.level',
      'Must be one of: info, warn, error'
    );
  });

  // ── CLEAN PASS — valid input produces zero errors ────────────────────────

  it('valid input — no errors', () => {
    const errors = validateSettings({
      listenerPort: 3400,
      batchWindowMs: 180000,
      telegram: {
        botToken: '123456789:AAExampleTokenForTestingPurposesXX',
        chatId: '-1001234567890',
        delayMs: 3000,
      },
      sonarr:  { baseUrl: 'http://127.0.0.1:8989', apiKey: 'abc123' },
      radarr:  { baseUrl: 'http://127.0.0.1:7878', apiKey: 'abc123' },
      tmdb:    { apiKey: 'abc123', language: 'ar-SA' },
      mediaCache: { ttlDays: 30, maxEntries: 500 },
      logging: { level: 'info' },
    });
    expect(errors, `expected 0 errors, got: ${JSON.stringify(errors)}`).toEqual([]);
  });

  // ── UNKNOWN / UNDEFINED KEYS IGNORED ────────────────────────────────────

  it('undefined fields are skipped — no spurious errors', () => {
    const errors = validateSettings({ someUnknownKey: 'whatever' });
    expect(errors).toEqual([]);
  });

});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const { getMaskedSettings } = require('../src/settings/serializer.js');

describe('Serializer Parity Harness (Phase A.3)', () => {
  let originalConfigSnapshot;

  beforeEach(() => {
    // 1. Backup the original config state so we don't bleed into other tests
    originalConfigSnapshot = JSON.parse(JSON.stringify(config));

    // 2. Inject a fixed fixture directly into the config singleton
    const fixture = {
      listenerPort: 3400,
      listenerHost: '0.0.0.0',
      batchWindowMs: 180000,
      queueFile: '/fake/path/media_queue.json', // Not in schema, should be ignored
      sonarr: { baseUrl: 'http://sonarr', apiKey: 'sonarr_secret_key' }, // length 17
      telegram: { botToken: '123456789:AAExxx', chatId: '-100', delayMs: 3000 }, // length 16
      emby: { refreshUrl: '', apiKey: '' },
      radarr: { baseUrl: 'http://radarr', apiKey: 'radarr_secret_key' }, // length 17
      tmdb: { apiKey: 'short', language: 'en-US' }, // length 5
      seerr: { baseUrl: '' },
      omdb: { apiKey: 'omdb_secret' }, // length 11
      translator: { endpoint: 'url', model: 'gpt', apiKey: 'ai_secret', deeplApiKey: 'deepl_secret' },
      mediaCache: { ttlDays: 30, maxEntries: 500 },
      backup: { enabled: true, intervalDays: 7, retainCount: 5 },
      logging: {
        level: 'info',
        rotation: {
          app: { maxSizeMb: 10, maxAgeDays: 7 },
          error: { maxSizeMb: 10, maxAgeDays: 30 },
          audit: { maxSizeMb: 5, maxAgeDays: 365 }
        }
      }
    };

    // Clear data keys but preserve config functions (save/reload/DEFAULTS)
    Object.keys(config).forEach(k => {
      if (typeof config[k] !== 'function' && k !== 'DEFAULTS') delete config[k];
    });
    Object.assign(config, fixture);
  });

  afterEach(() => {
    // Restore original config
    Object.keys(config).forEach(k => {
      if (typeof config[k] !== 'function' && k !== 'DEFAULTS') delete config[k];
    });
    Object.assign(config, originalConfigSnapshot);
  });

  it('getMaskedSettings output is byte-stable (key order and masking)', () => {
    const result = getMaskedSettings();

    // ── ASSERTION 1: ROOT KEY ORDER (Legacy Byte-Stability) ────────────
    const rootKeys = Object.keys(result);
    expect(rootKeys).toEqual([
      'listenerPort',
      'listenerHost',
      'batchWindowMs',
      'sonarr',
      'telegram',
      'emby',
      'radarr',
      'tmdb',
      'seerr',
      'omdb',
      'translator',
      'mediaCache',
      'backup',
      'logging'
    ]);

    // ── ASSERTION 2: SECRET MASKING LOGIC ──────────────────────────────
    // From secrets.js:
    // < 8 chars -> '••••••••'
    // >= 8 chars -> slice(0, 3) + '••••••••' + slice(-4)
    
    expect(result.sonarr.apiKey).toBe('son••••••••_key');   // len 17
    expect(result.tmdb.apiKey).toBe('••••••••');            // len 5
    expect(result.telegram.botToken).toBe('123••••••••Exxx'); // len 16

    // ── ASSERTION 3: FULL RECURSIVE SHAPE MATCH ────────────────────────
    expect(result).toEqual({
      listenerPort: 3400,
      listenerHost: '0.0.0.0',
      batchWindowMs: 180000,
      sonarr: { baseUrl: 'http://sonarr', apiKey: 'son••••••••_key' },
      telegram: { botToken: '123••••••••Exxx', chatId: '-100', delayMs: 3000 },
      emby: { refreshUrl: '', apiKey: '' },
      radarr: { baseUrl: 'http://radarr', apiKey: 'rad••••••••_key' },
      tmdb: { apiKey: '••••••••', language: 'en-US' },
      seerr: { baseUrl: '' },
      omdb: { apiKey: 'omd••••••••cret' },
      translator: { endpoint: 'url', model: 'gpt', apiKey: 'ai_••••••••cret', deeplApiKey: 'dee••••••••cret' },
      mediaCache: { ttlDays: 30, maxEntries: 500 },
      backup: { enabled: true, intervalDays: 7, retainCount: 5 },
      logging: {
        level: 'info',
        rotation: {
          app: { maxSizeMb: 10, maxAgeDays: 7 },
          error: { maxSizeMb: 10, maxAgeDays: 30 },
          audit: { maxSizeMb: 5, maxAgeDays: 365 }
        }
      }
    });

    // ── ASSERTION 4: NON-SCHEMA KEYS EXCLUDED ──────────────────────────
    // queueFile was injected into config but should not leak into settings
    expect(result.queueFile).toBeUndefined();
  });
});

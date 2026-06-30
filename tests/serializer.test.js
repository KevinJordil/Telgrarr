import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const { getMaskedSettings, getFieldSources } = require('../src/settings/serializer.js');
const { SECRET_MASK } = require('../src/settings/secrets.js');

describe('Serializer Parity Harness (Phase A.3)', () => {
  let originalConfigSnapshot;

  beforeEach(() => {
    // Backup the original config state so we don't bleed into other tests
    originalConfigSnapshot = JSON.parse(JSON.stringify(config));

    // Inject a fixed fixture directly into the config singleton
    const fixture = {
      listenerPort: 3400,
      listenerHost: '0.0.0.0',
      batchWindowMs: 180000,
      queueFile: '/fake/path/media_queue.json', // Not in schema, should be ignored
      publicBaseUrl: '',
      corsOrigin: '',
      trustProxy: '',
      cookieSecure: 'auto',
      sonarr: { baseUrl: 'http://sonarr', apiKey: 'sonarr_secret_key' },
      telegram: { botToken: '123456789:AAExxx', chatId: '-100', delayMs: 3000 },
      emby: { refreshUrl: '', apiKey: '' },
      radarr: { baseUrl: 'http://radarr', apiKey: 'radarr_secret_key' },
      tmdb: { apiKey: 'short' },
      seerr: { baseUrl: '' },
      omdb: { apiKey: 'omdb_secret' },
      translator: { endpoint: 'url', model: 'gpt', apiKey: 'ai_secret', deeplApiKey: 'deepl_secret', googleApiKey: 'google_secret', googleEndpoint: 'https://translation.googleapis.com/language/translate/v2', targetLang: 'ar', aiEnabled: true, deeplEnabled: true, googleEnabled: true, shortPlot: false, aiOnlyPlot: false },
      mediaCache: { ttlDays: 30, maxEntries: 500 },
        queue: { maxItems: 1000 },
      backup: { enabled: true, intervalDays: 7, retainCount: 5 },
      logging: {
        level: 'info',
        rotation: {
          app: { maxSizeMb: 10, maxAgeDays: 7 },
          error: { maxSizeMb: 10, maxAgeDays: 30 },
          audit: { maxSizeMb: 5, maxAgeDays: 365 }
        }
      },
      history: { maxItems: 500, maxAgeDays: 0 }
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

  it('getMaskedSettings output is byte-stable (key order and sentinel masking)', () => {
    const result = getMaskedSettings();

    // --- ASSERTION 1: ROOT KEY ORDER (Legacy Byte-Stability) ---
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
      'logging',
      'queue',
      'history',
      'publicBaseUrl',
      'corsOrigin',
      'trustProxy',
      'cookieSecure'
    ]);

    // --- ASSERTION 2: SECRET MASKING CONTRACT (H1 / SD-6) ---
    // Present secret -> constant SECRET_MASK sentinel (no value-derived chars,
    // regardless of length). Empty stays ''. Real value only via reveal (H1.3).
    expect(result.sonarr.apiKey).toBe(SECRET_MASK);
    expect(result.tmdb.apiKey).toBe(SECRET_MASK);
    expect(result.telegram.botToken).toBe(SECRET_MASK);
    expect(result.emby.apiKey).toBe('');

    // --- ASSERTION 3: FULL RECURSIVE SHAPE MATCH ---
    expect(result).toEqual({
      listenerPort: 3400,
      listenerHost: '0.0.0.0',
      batchWindowMs: 180000,
      sonarr: { baseUrl: 'http://sonarr', apiKey: SECRET_MASK },
      telegram: { botToken: SECRET_MASK, chatId: '-100', delayMs: 3000 },
      emby: { refreshUrl: '', apiKey: '' },
      radarr: { baseUrl: 'http://radarr', apiKey: SECRET_MASK },
      tmdb: { apiKey: SECRET_MASK },
      seerr: { baseUrl: '' },
      omdb: { apiKey: SECRET_MASK },
      publicBaseUrl: '',
      corsOrigin: '',
      trustProxy: '',
      cookieSecure: 'auto',
      translator: { endpoint: 'url', model: 'gpt', apiKey: SECRET_MASK, deeplApiKey: SECRET_MASK, googleApiKey: SECRET_MASK, googleEndpoint: 'https://translation.googleapis.com/language/translate/v2', targetLang: 'ar', aiEnabled: true, deeplEnabled: true, googleEnabled: true, shortPlot: false, aiOnlyPlot: false },
      mediaCache: { ttlDays: 30, maxEntries: 500 },
        queue: { maxItems: 1000 },
      backup: { enabled: true, intervalDays: 7, retainCount: 5 },
      logging: {
        level: 'info',
        rotation: {
          app: { maxSizeMb: 10, maxAgeDays: 7 },
          error: { maxSizeMb: 10, maxAgeDays: 30 },
          audit: { maxSizeMb: 5, maxAgeDays: 365 }
        }
      },
      history: { maxItems: 500, maxAgeDays: 0 }
    });

    // --- ASSERTION 4: NON-SCHEMA KEYS EXCLUDED ---
    expect(result.queueFile).toBeUndefined();
  });
});

describe('getFieldSources (H4.2 env annotation)', () => {
  let origPort, origHost, origEnv;

  beforeEach(() => {
    origPort = config.PORT; origHost = config.HOST; origEnv = config.envOverrides;
    Object.defineProperty(config, 'PORT', { value: 9999, enumerable: false, configurable: true });
    Object.defineProperty(config, 'HOST', { value: '1.2.3.4', enumerable: false, configurable: true });
    Object.defineProperty(config, 'envOverrides', { value: { PORT: true, HOST: false }, enumerable: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(config, 'PORT', { value: origPort, enumerable: false, configurable: true });
    Object.defineProperty(config, 'HOST', { value: origHost, enumerable: false, configurable: true });
    Object.defineProperty(config, 'envOverrides', { value: origEnv, enumerable: false, configurable: true });
  });

  it('annotates only envVar fields with source/effective/editable', () => {
    const meta = getFieldSources();
    expect(Object.keys(meta)).toEqual(['listenerPort', 'listenerHost', 'corsOrigin', 'trustProxy', 'cookieSecure']);
    expect(meta.listenerPort).toEqual({ source: 'env', effective: 9999, editable: false });
    expect(meta.listenerHost).toEqual({ source: 'file', effective: '1.2.3.4', editable: true });
  });
});

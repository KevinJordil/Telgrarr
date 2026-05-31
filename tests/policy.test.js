import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
const { needsRestart } = require('../src/settings/policy.js');

describe('Policy Parity Harness (Phase A.4)', () => {
  let originalConfigSnapshot;

  beforeEach(() => {
    // Backup the original config state
    originalConfigSnapshot = JSON.parse(JSON.stringify(config));

    // Inject baseline state for the watched keys
    Object.assign(config, {
      listenerPort: 3400,
      listenerHost: '0.0.0.0',
      logging: { level: 'info' }
    });
  });

  afterEach(() => {
    // Restore original config
    Object.keys(config).forEach(k => {
      if (typeof config[k] !== 'function' && k !== 'DEFAULTS') delete config[k];
    });
    Object.assign(config, originalConfigSnapshot);
  });

  // ── TRUTH TABLE ASSERTIONS ───────────────────────────────────────────────

  it('returns false for empty or unchanged incoming settings', () => {
    expect(needsRestart({})).toBe(false);
    expect(needsRestart({ listenerPort: 3400 })).toBe(false); // same port
    expect(needsRestart({ listenerHost: '0.0.0.0' })).toBe(false); // same host
    expect(needsRestart({ logging: { level: 'info' } })).toBe(false); // same level
  });

  it('returns false for undefined watched fields (partial updates)', () => {
    // The frontend often sends payloads without unchanged keys
    expect(needsRestart({ listenerPort: undefined, logging: {} })).toBe(false);
  });

  it('returns false when unrelated fields change', () => {
    expect(needsRestart({
      batchWindowMs: 999999,
      telegram: { botToken: 'new_token' },
      sonarr: { baseUrl: 'http://new-url' }
    })).toBe(false);
  });

  it('returns true when listenerPort changes', () => {
    expect(needsRestart({ listenerPort: 3401 })).toBe(true);
  });

  it('returns true when listenerHost changes', () => {
    expect(needsRestart({ listenerHost: '127.0.0.1' })).toBe(true);
  });

  it('returns true when logging.level changes', () => {
    expect(needsRestart({ logging: { level: 'warn' } })).toBe(true);
    expect(needsRestart({ logging: { level: 'error' } })).toBe(true);
  });

  it('returns true when multiple watched fields change', () => {
    expect(needsRestart({
      listenerPort: 3405,
      logging: { level: 'error' }
    })).toBe(true);
  });
});

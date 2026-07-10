import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// NOISE3 / Master Section 7 [S3] parity: validateRequiredCredentials must log at
// warn severity ONLY -- missing-credential state is benign, self-healing, and
// explicitly not a failure (config.save() never throws on it). Prior to this
// suite, each missing credential logged at ERROR severity, flooding error.log
// with normal first-boot / not-yet-configured state. Sandbox DATA_DIR + LOGS_DIR
// to a tmp dir BEFORE requiring config.js so boot read/log writes never touch
// live state (same idiom as config-required-credentials.test.js).
const tmpDir = path.join(
  os.tmpdir(),
  `telgrarr-credlog-test-${process.pid}-${Date.now()}`
);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DATA_DIR = tmpDir;
process.env.LOGS_DIR = tmpDir;

// A config.json MUST exist: loadFromDisk() early-returns (only a warn about the
// missing file) when CONFIG_FILE is absent, never reaching validateRequiredCredentials.
// Writing an empty object reproduces the real-world post-first-boot state --
// config.json materialized (Master Section 4), credentials still unset.
fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({}));

// DI stub: replace logger.js in THIS test file's module registry before requiring
// config.js, so no real log file is ever touched and every call is captured
// directly (VITEST HARNESS pattern -- DI without vi.mock).
const calls = { error: [], warn: [] };
const loggerPath = require.resolve('../src/logger.js');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: {
    error: (mod, msg) => calls.error.push([mod, msg]),
    warn:  (mod, msg) => calls.warn.push([mod, msg]),
    info:  () => {},
    audit: () => {},
    setLevel: () => {},
    getRecentLogs: () => [],
    getFilteredLogs: () => [],
    reopenLogFiles: () => {},
  },
};

require('../src/config.js');

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('missing-credential boot logging severity (NOISE3 / Master Section 7 S3 parity)', () => {
  it('never logs missing-credential state at error level', () => {
    const errorMsgs = calls.error.map(([, msg]) => msg);
    expect(errorMsgs.some(m => m.includes('Missing required credential'))).toBe(false);
  });

  it('logs each missing credential at warn level', () => {
    const warnMsgs = calls.warn.map(([, msg]) => msg);
    const perCredential = warnMsgs.filter(m => m.startsWith('Missing required credential: '));
    expect(perCredential.length).toBe(7);
  });

  it('still logs the boot summary warn line', () => {
    const warnMsgs = calls.warn.map(([, msg]) => msg);
    expect(warnMsgs.some(m => m.includes('App is booting with missing credentials'))).toBe(true);
  });

  it('module noun is Config for every captured call (L5 taxonomy)', () => {
    const allCalls = [...calls.error, ...calls.warn];
    expect(allCalls.every(([mod]) => mod === 'Config')).toBe(true);
  });
});

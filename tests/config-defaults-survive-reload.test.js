import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-12 / F4a — config.DEFAULTS must survive reload()/save() calls. Prior to
// this fix, `config.DEFAULTS = DEFAULTS` was a plain enumerable assignment;
// reload()'s Object.keys(config) delete-loop treated it as ordinary state and
// deleted it, with no restoration path — the FIRST settings save (or any
// direct reload()) permanently killed it. translator.js:179 reads
// config.DEFAULTS.translator.googleEndpoint at CALL time (breaks mid-cascade
// post-reload); connection-tester.js reads the same path at REQUIRE time
// (was safe only by boot-order accident). Same isolation idiom as
// config-required-credentials.test.js: sandbox DATA_DIR/LOGS_DIR to a tmp dir
// BEFORE requiring config so boot reads/writes never touch live state.
const tmpDir = path.join(
  os.tmpdir(),
  `telgrarr-config-defaults-test-${process.pid}-${Date.now()}`
);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DATA_DIR = tmpDir;
process.env.LOGS_DIR = tmpDir;

const config = require('../src/config.js');

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('config.DEFAULTS survives reload/save (FA-12 drift guard)', () => {
  it('is reachable immediately after require (require-time consumer class, e.g. connection-tester.js)', () => {
    expect(config.DEFAULTS.translator.googleEndpoint).toBe(
      'https://translation.googleapis.com/language/translate/v2'
    );
  });

  it('is non-enumerable (Object.keys(config) never includes it — matches the B.1 DATA_DIR/PORT pattern)', () => {
    expect(Object.keys(config)).not.toContain('DEFAULTS');
  });

  it('is excluded from JSON serialization (never persisted, same guarantee stripVolatile already provided by name)', () => {
    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain('"DEFAULTS"');
  });

  it('survives a direct reload() call (the exact FA-12 regression: pre-fix this deleted DEFAULTS permanently)', () => {
    config.reload();
    expect(config.DEFAULTS).toBeDefined();
    expect(config.DEFAULTS.translator.googleEndpoint).toBe(
      'https://translation.googleapis.com/language/translate/v2'
    );
  });

  it('survives a real save() call (call-time consumer class, e.g. translator.js:179, through the full save->reload chain)', async () => {
    await config.save({ logging: { level: 'warn' } });
    expect(config.DEFAULTS).toBeDefined();
    expect(config.DEFAULTS.translator.googleEndpoint).toBe(
      'https://translation.googleapis.com/language/translate/v2'
    );
  });
});

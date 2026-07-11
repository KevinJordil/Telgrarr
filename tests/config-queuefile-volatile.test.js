import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-1 / F4b — queueFile must never be SOURCED from disk (loadFromDisk ignores a
// persisted value; the boot-resolved DEFAULTS.queueFile, DATA_DIR-anchored per
// Master Section 4 as amended OSR-3, always wins) and must never be WRITTEN back to
// disk (stripVolatile excludes it from every atomic write, shared by save() and the
// first-boot ensureWebhookSecret() persist). Without this, a backup/restore or a
// hand-edited config.json carrying another host's absolute queueFile path would
// silently redirect the live queue file to a dead path. Same isolation idiom as
// config-defaults-survive-reload.test.js: sandbox DATA_DIR/LOGS_DIR to a tmp dir,
// and here also PRE-SEED an adversarial config.json BEFORE requiring config, so
// loadFromDisk's boot read sees the foreign value.
const tmpDir = path.join(
  os.tmpdir(),
  `telgrarr-config-queuefile-test-${process.pid}-${Date.now()}`
);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DATA_DIR = tmpDir;
process.env.LOGS_DIR = tmpDir;

const FOREIGN_QUEUE_FILE = '/some/other/host/media_queue.json';
const seedConfigPath = path.join(tmpDir, 'config.json');
fs.writeFileSync(
  seedConfigPath,
  JSON.stringify({ queueFile: FOREIGN_QUEUE_FILE, listenerPort: 3400 }, null, 2)
);

const config = require('../src/config.js');

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('config.queueFile is volatile — never disk-sourced, never disk-persisted (FA-1)', () => {
  it('ignores a foreign queueFile from a pre-existing config.json at boot (load-direction fix)', () => {
    expect(config.queueFile).not.toBe(FOREIGN_QUEUE_FILE);
    expect(config.queueFile).toBe(config.DEFAULTS.queueFile);
  });

  it('DEFAULTS.queueFile resolves under DATA_DIR (Master Section 4 law, amended OSR-3)', () => {
    expect(config.DEFAULTS.queueFile.endsWith('media_queue.json')).toBe(true);
    expect(config.DEFAULTS.queueFile).toBe(path.join(tmpDir, 'media_queue.json'));
  });

  it('never writes queueFile back to config.json on save() (save-direction fix)', async () => {
    await config.save({ logging: { level: 'warn' } });
    const onDisk = JSON.parse(fs.readFileSync(seedConfigPath, 'utf8'));
    expect(onDisk).not.toHaveProperty('queueFile');
  });

  it('keeps resolving to the boot default after reload(), even re-reading the same on-disk file', () => {
    config.reload();
    expect(config.queueFile).toBe(config.DEFAULTS.queueFile);
  });
});

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-qmig-'));
process.env.DATA_DIR = TMP;
process.env.LOGS_DIR = TMP;
const config = require('../src/config.js');
const NEW_QUEUE = path.join(TMP, 'newloc', 'media_queue.json');
fs.mkdirSync(path.dirname(NEW_QUEUE), { recursive: true });
config.queueFile = NEW_QUEUE;
const { migrateLegacyQueueFile } = require('../src/queue.js');
const LEGACY = path.join(TMP, 'media_queue.json');
beforeEach(() => {
  for (const f of [LEGACY, NEW_QUEUE]) { try { fs.unlinkSync(f); } catch (_) {} }
});
afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });
describe('queue legacy-file migration (OSR-3 Finding 1 -- Master Section 4 amendment)', () => {
  it('moves a legacy root queue file to the configured path, content preserved', () => {
    fs.writeFileSync(LEGACY, '[{"id":1}]', 'utf8');
    expect(migrateLegacyQueueFile(LEGACY)).toBe(true);
    expect(fs.existsSync(LEGACY)).toBe(false);
    expect(fs.readFileSync(NEW_QUEUE, 'utf8')).toBe('[{"id":1}]');
  });
  it('never clobbers: no-op when the configured path already exists', () => {
    fs.writeFileSync(LEGACY, '["legacy"]', 'utf8');
    fs.writeFileSync(NEW_QUEUE, '["current"]', 'utf8');
    expect(migrateLegacyQueueFile(LEGACY)).toBe(false);
    expect(fs.readFileSync(LEGACY, 'utf8')).toBe('["legacy"]');
    expect(fs.readFileSync(NEW_QUEUE, 'utf8')).toBe('["current"]');
  });
  it('no-op when no legacy file exists', () => {
    expect(migrateLegacyQueueFile(LEGACY)).toBe(false);
    expect(fs.existsSync(NEW_QUEUE)).toBe(false);
  });
  it('no-op guard when legacy path equals the configured path', () => {
    fs.writeFileSync(NEW_QUEUE, '[]', 'utf8');
    expect(migrateLegacyQueueFile(NEW_QUEUE)).toBe(false);
    expect(fs.readFileSync(NEW_QUEUE, 'utf8')).toBe('[]');
  });
  it('falls back to copy+unlink on EXDEV (cross-device rename)', () => {
    fs.writeFileSync(LEGACY, '["xdev"]', 'utf8');
    const exdev = () => { const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e; };
    expect(migrateLegacyQueueFile(LEGACY, exdev)).toBe(true);
    expect(fs.existsSync(LEGACY)).toBe(false);
    expect(fs.readFileSync(NEW_QUEUE, 'utf8')).toBe('["xdev"]');
  });
  it('non-EXDEV rename error: fail-soft, legacy intact, returns false', () => {
    fs.writeFileSync(LEGACY, '["keep"]', 'utf8');
    const eperm = () => { const e = new Error('perm'); e.code = 'EPERM'; throw e; };
    expect(migrateLegacyQueueFile(LEGACY, eperm)).toBe(false);
    expect(fs.readFileSync(LEGACY, 'utf8')).toBe('["keep"]');
    expect(fs.existsSync(NEW_QUEUE)).toBe(false);
  });
});

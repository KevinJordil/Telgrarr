import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// FA-24(i) (Master §7 D-E): the three pino destinations (app/error/audit) were
// created at default fs mode. This suite proves each lands at 0600 on both
// FRESH creation and after a simulated log-rotation reopen -- the two "created"
// paths FAR names. A pre-existing default-mode file is untouched by this fix
// (must be chmod'd manually on a live host -- see commit message).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-loggerperms-'));
process.env.DATA_DIR = TMP;   // isolate events.js's DATA_DIR-direct read (RD-11 class)
process.env.LOGS_DIR = TMP;   // isolate logger.js's LOGS_DIR-direct read (RD-12)

const logger = require('../src/logger.js');

const mode = (f) => fs.statSync(f).mode & 0o777;
const APP   = path.join(TMP, 'app.log');
const ERR   = path.join(TMP, 'error.log');
const AUDIT = path.join(TMP, 'audit.log');

afterAll(() => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {} });

describe('FA-24(i) logger.js pino destinations are created 0600', () => {
  it('app.log, error.log, audit.log all land at 0600 on fresh creation', () => {
    logger.info('Test', 'info line');
    logger.error('Test', 'error line');
    logger.audit('Test', 'audit line');
    expect(fs.existsSync(APP)).toBe(true);
    expect(fs.existsSync(ERR)).toBe(true);
    expect(fs.existsSync(AUDIT)).toBe(true);
    expect(mode(APP)).toBe(0o600);
    expect(mode(ERR)).toBe(0o600);
    expect(mode(AUDIT)).toBe(0o600);
  });

  it('a post-rotation reopen recreates app.log at 0600', () => {
    fs.renameSync(APP, `${APP}.rotated`);
    logger.reopenLogFiles();
    logger.info('Test', 'after reopen');
    expect(fs.existsSync(APP)).toBe(true);
    expect(mode(APP)).toBe(0o600);
  });
});

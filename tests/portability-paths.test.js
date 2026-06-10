import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// FU-7 portability guard: every DATA_DIR-backed state file must resolve UNDER
// DATA_DIR, never the package's ../data. Sandbox DATA_DIR + LOGS_DIR BEFORE any
// require so config (and env-direct events.js) capture the tmp dir at load.
const tmp = path.join(os.tmpdir(), `telgrarr-fu7-${process.pid}-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_DIR = tmp;
process.env.LOGS_DIR = tmp;
const here = (n) => path.join(tmp, n);

const config    = require('../src/config.js');
const events    = require('../src/events.js');
const auth      = require('../src/middlewares/auth.js');
const templates = require('../src/templates.js');
const blacklist = require('../src/blacklist.js');
require('../src/history.js'); // boot-writes history.json on require

afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

describe('FU-7 — DATA_DIR portability (state files resolve under DATA_DIR)', () => {
  it('config.DATA_DIR honors the env sandbox', () => {
    expect(config.DATA_DIR).toBe(tmp);
  });
  it('history.json is created under DATA_DIR on module load', () => {
    expect(fs.existsSync(here('history.json'))).toBe(true);
  });
  it('auth sessions.json writes under DATA_DIR', async () => {
    await auth.flushSessions();
    expect(fs.existsSync(here('sessions.json'))).toBe(true);
  });
  it('events-ring.json writes under DATA_DIR (env-direct, no cycle)', async () => {
    await events.flushEvents();
    expect(fs.existsSync(here('events-ring.json'))).toBe(true);
  });
  it('templates.json writes under DATA_DIR', async () => {
    await templates.setActiveMode('default_en');
    expect(fs.existsSync(here('templates.json'))).toBe(true);
  });
  it('blacklist.json writes under DATA_DIR', async () => {
    await blacklist.addId('sonarr', 12345);
    expect(fs.existsSync(here('blacklist.json'))).toBe(true);
  });
});

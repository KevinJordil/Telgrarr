import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Sandbox DATA_DIR before requiring blacklist (BLACKLIST_FILE resolves under
// config.DATA_DIR at load — FU-7).
const tmp = path.join(os.tmpdir(), `telgrarr-bl-${process.pid}-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_DIR = tmp;
process.env.LOGS_DIR = tmp;

const FILE = path.join(tmp, 'blacklist.json');
const lockfile = require('proper-lockfile');
const realLock = lockfile.lock;
const blacklist = require('../src/blacklist.js');

const VALID = { sonarr: { ids: [7], paths: [] }, radarr: { ids: [], paths: [] } };

function cleanup() {
  try { fs.rmSync(FILE, { force: true }); } catch (_) {}
  try { fs.rmSync(`${FILE}.lock`, { recursive: true, force: true }); } catch (_) {}
}

beforeEach(() => { lockfile.lock = realLock; cleanup(); });
afterAll(() => { lockfile.lock = realLock; cleanup(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

describe('blacklist.writeToDisk — corruption-safe under lock failure', () => {
  it('happy path: writes valid JSON containing the new id', async () => {
    await blacklist.addId('sonarr', 42);
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    expect(parsed.sonarr.ids).toContain(42);
  });

  it('lock failure leaves a pre-existing file VALID (no append corruption)', async () => {
    fs.writeFileSync(FILE, JSON.stringify(VALID, null, 2));
    lockfile.lock = () => Promise.reject(new Error('lock timeout'));
    await expect(blacklist.addId('radarr', 99)).rejects.toThrow();
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')); // must still parse
    expect(parsed).toEqual(VALID);
  });
});

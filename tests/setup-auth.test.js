import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs   from 'node:fs';
import os   from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { hashNew } = require('../src/auth/credentials');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, '..', 'setup-auth.js');
let tmpRoot;

afterEach(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true });
  tmpRoot = undefined;
});

function run(input, dataDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    input, env: { ...process.env, DATA_DIR: dataDir }, encoding: 'utf8',
  });
}

describe('setup-auth.js (PR-1 fresh-clone bootstrap)', () => {
  it('creates a missing nested DATA_DIR and writes a 0600 auth.json with a valid hash record', () => {
    tmpRoot = path.join(os.tmpdir(), `telgrarr-sa-${process.pid}-${Date.now()}`);
    const dataDir = path.join(tmpRoot, 'data');     // missing + nested => exercises recursive mkdir
    expect(fs.existsSync(dataDir)).toBe(false);

    const res = run('testuser\npassword1234\npassword1234\n', dataDir);
    expect(res.status).toBe(0);

    const authPath = path.join(dataDir, 'auth.json');
    expect(fs.existsSync(authPath)).toBe(true);
    expect(fs.statSync(authPath).mode & 0o777).toBe(0o600);

    const saved = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    expect(saved.username).toBe('testuser');

    const expectedKeys = Object.keys(hashNew('sample-password')).sort();
    const actualKeys   = Object.keys(saved).filter(k => k !== 'username').sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it('rejects a too-short password (exit 1) and writes no auth.json', () => {
    tmpRoot = path.join(os.tmpdir(), `telgrarr-sa-short-${process.pid}-${Date.now()}`);
    const dataDir = path.join(tmpRoot, 'data');
    const res = run('testuser\nshort\nshort\n', dataDir);
    expect(res.status).toBe(1);
    expect(fs.existsSync(path.join(dataDir, 'auth.json'))).toBe(false);
  });
});

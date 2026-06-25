import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_SRC = path.resolve(__dirname, '..', 'release-manager.js');
const NODE_MODULES = path.resolve(__dirname, '..', 'node_modules');

function run(tmp, args) {
  return execFileSync('node', [path.join(tmp, 'release-manager.js'), ...args], {
    env: { ...process.env, DATA_DIR: tmp, NODE_PATH: NODE_MODULES },
    encoding: 'utf8',
  });
}
function runExpectFail(tmp, args) {
  try { run(tmp, args); } catch (e) { return e; }
  throw new Error('expected non-zero exit, got success');
}
const readPkg = (tmp) => JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8'));
const readLedger = (tmp) => JSON.parse(fs.readFileSync(path.join(tmp, 'system-release.json'), 'utf8'));

describe('release-manager set', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-set-'));
    fs.copyFileSync(SCRIPT_SRC, path.join(tmp, 'release-manager.js'));
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src', 'load-env.js'), 'module.exports = () => {};\n');
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'telgrarr', version: '0.1.0' }, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'system-release.json'), JSON.stringify({ history: [], tier: 'production', buildTimestamp: 't0' }, null, 2) + '\n');
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('set writes an explicit beta version and flips tier to beta', () => {
    run(tmp, ['set', '1.0.0-beta.1']);
    expect(readPkg(tmp).version).toBe('1.0.0-beta.1');
    const led = readLedger(tmp);
    expect(led.tier).toBe('beta');
    expect(led.history.some((h) => h.version === '0.1.0')).toBe(true);
  });
  it('set writes an explicit stable version with production tier', () => {
    run(tmp, ['set', '1.0.0']);
    expect(readPkg(tmp).version).toBe('1.0.0');
    expect(readLedger(tmp).tier).toBe('production');
  });
  it('set rejects an invalid target ON THE VALIDATION PATH and leaves package.json untouched', () => {
    const err = runExpectFail(tmp, ['set', 'not-a-version']);
    expect(String(err.stderr)).toContain('Invalid target version');
    expect(readPkg(tmp).version).toBe('0.1.0');
  });
  it('set requires a target version (missing-target path, pkg untouched)', () => {
    const err = runExpectFail(tmp, ['set']);
    expect(String(err.stderr)).toContain('Missing target version');
    expect(readPkg(tmp).version).toBe('0.1.0');
  });
  it('parity: patch bump 0.1.0 -> 0.1.1 (production)', () => {
    run(tmp, ['patch']);
    expect(readPkg(tmp).version).toBe('0.1.1');
    expect(readLedger(tmp).tier).toBe('production');
  });
  it('parity: beta-bump on stable base -> 0.1.1-beta.1', () => {
    run(tmp, ['beta-bump']);
    expect(readPkg(tmp).version).toBe('0.1.1-beta.1');
  });
});

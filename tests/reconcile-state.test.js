import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);

const STATE_ID  = require.resolve('../src/reconcile-state.js');
const CONFIG_ID = require.resolve('../src/config.js');
const LOGGER_ID = require.resolve('../src/logger.js');

function stub(id, exports) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

let logged;
function installEnv(dataDir) {
  logged = [];
  stub(CONFIG_ID, { DATA_DIR: dataDir });
  stub(LOGGER_ID, {
    error: (...a) => logged.push(['error', ...a]),
    warn:  (...a) => logged.push(['warn', ...a]),
    info:  (...a) => logged.push(['info', ...a]),
    audit: (...a) => logged.push(['audit', ...a]),
  });
}

// Fresh module instance bound to dataDir; dropping the singleton forces reads from disk,
// which is how we prove atomic round-trip persistence.
function load(dataDir) {
  installEnv(dataDir);
  delete require.cache[STATE_ID];
  return require('../src/reconcile-state.js');
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-recon-'));
const STATE_PATH = (d) => path.join(d, 'reconcile-state.json');
const EMPTY = {
  sonarr: { since: null, sentKeys: [] },
  radarr: { since: null, sentKeys: [] },
};

describe('reconcile-state (STEP 2.1 / WR-3 / WR-13 / C-LEDGER)', () => {

  it('first run: getState returns the empty default and writes no file', () => {
    const d = tmpDir();
    const S = load(d);
    expect(S.getState()).toEqual(EMPTY);
    expect(fs.existsSync(STATE_PATH(d))).toBe(false);
  });

  it('setSince persists and round-trips across a fresh load (atomic)', () => {
    const d = tmpDir();
    let S = load(d);
    S.setSince('sonarr', '2026-01-01T00:00:00.000Z');
    expect(fs.existsSync(STATE_PATH(d))).toBe(true);
    S = load(d);
    expect(S.getState().sonarr.since).toBe('2026-01-01T00:00:00.000Z');
    expect(S.getState().radarr.since).toBe(null);
  });

  it('recordSent + isSent: recorded keys are sent, others are not; sources isolated', () => {
    const d = tmpDir();
    const S = load(d);
    S.recordSent('radarr', ['radarr:10', 'radarr:11']);
    expect(S.isSent('radarr', 'radarr:10')).toBe(true);
    expect(S.isSent('radarr', 'radarr:11')).toBe(true);
    expect(S.isSent('radarr', 'radarr:99')).toBe(false);
    expect(S.isSent('sonarr', 'radarr:10')).toBe(false);
  });

  it('recordSent round-trips across a fresh load', () => {
    const d = tmpDir();
    let S = load(d);
    S.recordSent('sonarr', ['sonarr:1:eid:5']);
    S = load(d);
    expect(S.isSent('sonarr', 'sonarr:1:eid:5')).toBe(true);
  });

  it('ring is capped at LEDGER_SIZE, evicting the oldest', () => {
    const d = tmpDir();
    const S = load(d);
    const N = S.LEDGER_SIZE;
    const keys = Array.from({ length: N + 3 }, (_, i) => 'k' + i);
    S.recordSent('sonarr', keys);
    expect(S.getState().sonarr.sentKeys).toHaveLength(N);
    expect(S.isSent('sonarr', 'k0')).toBe(false);
    expect(S.isSent('sonarr', 'k1')).toBe(false);
    expect(S.isSent('sonarr', 'k2')).toBe(false);
    expect(S.isSent('sonarr', 'k' + (N + 2))).toBe(true);
  });

  it('recordSent dedups: a repeated key does not grow the ring and refreshes recency', () => {
    const d = tmpDir();
    const S = load(d);
    S.recordSent('sonarr', ['a', 'b', 'c']);
    S.recordSent('sonarr', ['b']);
    expect(S.getState().sonarr.sentKeys).toEqual(['a', 'c', 'b']);
  });

  it('recordSent ignores empty / non-array input (no write, no throw)', () => {
    const d = tmpDir();
    const S = load(d);
    S.recordSent('sonarr', []);
    S.recordSent('sonarr', null);
    S.recordSent('sonarr', undefined);
    expect(fs.existsSync(STATE_PATH(d))).toBe(false);
    expect(S.getState().sonarr.sentKeys).toEqual([]);
  });

  it('unknown source is fail-soft: setSince/recordSent no-op, isSent false, warns', () => {
    const d = tmpDir();
    const S = load(d);
    S.setSince('bogus', '2026-01-01T00:00:00.000Z');
    S.recordSent('bogus', ['x']);
    expect(S.isSent('bogus', 'x')).toBe(false);
    expect(fs.existsSync(STATE_PATH(d))).toBe(false);
    expect(logged.some(([lvl]) => lvl === 'warn')).toBe(true);
  });

  it('malformed file → safe default, logged, no throw', () => {
    const d = tmpDir();
    fs.writeFileSync(STATE_PATH(d), '{ this is : not json');
    const S = load(d);
    expect(S.getState()).toEqual(EMPTY);
    expect(logged.some(([lvl]) => lvl === 'error')).toBe(true);
  });

  it('partial / junk-shaped file is normalized (missing source, bad types repaired)', () => {
    const d = tmpDir();
    fs.writeFileSync(STATE_PATH(d), JSON.stringify({
      sonarr: { since: 12345, sentKeys: ['ok', 42, '', null, 'ok2'] },
    }));
    const S = load(d);
    const st = S.getState();
    expect(st.sonarr.since).toBe(null);
    expect(st.sonarr.sentKeys).toEqual(['ok', 'ok2']);
    expect(st.radarr).toEqual({ since: null, sentKeys: [] });
  });

  it('over-long ring in a hand-edited file is trimmed on load', () => {
    const d = tmpDir();
    const big = Array.from({ length: 1500 }, (_, i) => 'old' + i);
    fs.writeFileSync(STATE_PATH(d), JSON.stringify({
      sonarr: { since: null, sentKeys: big },
      radarr: { since: null, sentKeys: [] },
    }));
    const S = load(d);
    expect(S.getState().sonarr.sentKeys.length).toBe(S.LEDGER_SIZE);
    expect(S.isSent('sonarr', 'old1499')).toBe(true);
    expect(S.isSent('sonarr', 'old0')).toBe(false);
  });

  it('write error is fail-soft (DATA_DIR points at a non-directory)', () => {
    const base = tmpDir();
    const notDir = path.join(base, 'afile');
    fs.writeFileSync(notDir, 'x');
    const S = load(notDir);
    expect(() => S.setSince('sonarr', '2026-01-01T00:00:00.000Z')).not.toThrow();
    expect(logged.some(([lvl]) => lvl === 'error')).toBe(true);
  });
});

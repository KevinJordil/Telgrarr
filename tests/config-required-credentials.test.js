import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';

const require = createRequire(import.meta.url);

// G.1c — lock REQUIRED_CREDENTIALS as SCHEMA-DERIVED (G.1a/G.1b).
// getMissingCredentials(cfg) is pure over its argument, so the assertions never
// rely on live config values. But requiring config.js runs loadFromDisk('boot')
// (reads CONFIG_FILE, may emit warn/error log writes). Sandbox DATA_DIR + LOGS_DIR
// to a tmp dir BEFORE requiring config so the boot read/log writes never touch
// live state. Same idiom as media-cache.test.js.
const tmpDir = path.join(
  os.tmpdir(),
  `telgrarr-reqcred-test-${process.pid}-${Date.now()}`
);
fs.mkdirSync(tmpDir, { recursive: true });
process.env.DATA_DIR = tmpDir;
process.env.LOGS_DIR = tmpDir;

const config = require('../src/config.js');
const { SETTINGS_SCHEMA } = require('../src/settings-schema.js');

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

// DRIFT ANCHOR — the 7 required-credential labels in schema (= GUI Settings) order,
// transcribed verbatim from the pre-G.1b hardcoded REQUIRED_CREDENTIALS set.
// Adding, removing, renaming, or reordering a bootRequired hint in
// settings-schema.js MUST break this test, forcing the change to be deliberate.
const HISTORICAL_REQUIRED_LABELS = [
  'Telegram bot token',
  'Telegram chat ID',
  'Sonarr base URL',
  'Sonarr API key',
  'Radarr base URL',
  'Radarr API key',
  'TMDB API key',
];

const FULL_CFG = {
  telegram: { botToken: 'x', chatId: 'x' },
  sonarr:   { baseUrl: 'x', apiKey: 'x' },
  radarr:   { baseUrl: 'x', apiKey: 'x' },
  tmdb:     { apiKey: 'x' },
};

describe('REQUIRED_CREDENTIALS — schema-derived (G.1 drift guard)', () => {
  it('empty cfg => every required label, in schema order', () => {
    expect(config.getMissingCredentials({})).toEqual(HISTORICAL_REQUIRED_LABELS);
  });

  it('fully-populated cfg => no missing credentials', () => {
    expect(config.getMissingCredentials(FULL_CFG)).toEqual([]);
  });

  it('partial cfg => only the absent labels, still in schema order', () => {
    // telegram + sonarr present; radarr + tmdb absent. Catches section/key
    // mis-slicing and order regressions the all-present / all-absent cases miss.
    const cfg = {
      telegram: { botToken: 'x', chatId: 'x' },
      sonarr:   { baseUrl: 'x', apiKey: 'x' },
    };
    expect(config.getMissingCredentials(cfg)).toEqual([
      'Radarr base URL',
      'Radarr API key',
      'TMDB API key',
    ]);
  });

  it('blank / whitespace-only values count as missing', () => {
    const cfg = {
      telegram: { botToken: '', chatId: '   ' },
      sonarr:   { baseUrl: 'x', apiKey: 'x' },
      radarr:   { baseUrl: 'x', apiKey: 'x' },
      tmdb:     { apiKey: 'x' },
    };
    expect(config.getMissingCredentials(cfg)).toEqual([
      'Telegram bot token',
      'Telegram chat ID',
    ]);
  });

  it('config derivation matches settings-schema bootRequired (SSoT consistency)', () => {
    // Independently re-derive from the schema and assert config emits exactly that
    // set, in order. Fails if config.js flatMap drifts from the bootRequired hints.
    const schemaDerived = SETTINGS_SCHEMA.flatMap(section =>
      (section.fields || [])
        .filter(field => field.bootRequired)
        .map(field => field.bootRequired)
    );
    expect(config.getMissingCredentials({})).toEqual(schemaDerived);
  });
});

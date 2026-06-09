'use strict';
const fs      = require('fs').promises;
const path    = require('path');
const config  = require('./config');
const log     = require('./logger');

const LOGS_DIR = path.join(__dirname, '../logs');
const MODULE   = 'LogRotator';

const FAMILIES = [
  { name: 'app',   file: 'app.log'   },
  { name: 'error', file: 'error.log' },
  { name: 'audit', file: 'audit.log' },
];

const MAX_ARCHIVE_GENERATIONS_PER_DAY = 9999;

function dateTag() {
  return new Date().toISOString().slice(0, 10);
}

async function resolveArchiveName(family) {
  const base = family.file.replace('.log', '');
  const date = dateTag();
  for (let gen = 1; gen <= MAX_ARCHIVE_GENERATIONS_PER_DAY; gen++) {
    const candidate = path.join(LOGS_DIR, `${base}.${date}.${gen}.log`);
    try {
      await fs.stat(candidate);
      // candidate exists; try next gen
    } catch (err) {
      if (err.code === 'ENOENT') return candidate;
      throw new Error(`resolveArchiveName: stat error for ${candidate}: ${err.message}`);
    }
  }
  throw new Error(`resolveArchiveName: exceeded ${MAX_ARCHIVE_GENERATIONS_PER_DAY} generations for ${family.file} on ${date}`);
}

async function rotateFamily(family, rotCfg) {
  if (!rotCfg) return;
  if (typeof rotCfg.maxSizeMb !== 'number' || rotCfg.maxSizeMb <= 0 ||
      typeof rotCfg.maxAgeDays !== 'number' || rotCfg.maxAgeDays <= 0) {
    log.warn(MODULE, `${family.name} rotation: invalid maxSizeMb/maxAgeDays (must be positive numbers); skipping`);
    return;
  }

  const activeFile = path.join(LOGS_DIR, family.file);

  let stats;
  try {
    stats = await fs.stat(activeFile);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log.warn(MODULE, `${family.file} stat failed: ${err.message}; skipping rotation pass`);
    }
    return;
  }

  const sizeMb = stats.size / (1024 * 1024);
  if (sizeMb >= rotCfg.maxSizeMb) {
    let archivePath;
    try {
      archivePath = await resolveArchiveName(family);
    } catch (err) {
      log.warn(MODULE, `${family.file} rotation: ${err.message}; skipping`);
      return;
    }
    try {
      await fs.rename(activeFile, archivePath);
      log.reopenLogFiles();
      log.info(MODULE, `${family.file} rotated → ${path.basename(archivePath)} (${sizeMb.toFixed(2)} MB)`);
    } catch (err) {
      log.warn(MODULE, `${family.file} rotation rename failed: ${err.message}`);
      return;
    }
  }

  const base     = family.file.replace('.log', '');
  const cutoffMs = rotCfg.maxAgeDays * 24 * 60 * 60 * 1000;
  const now      = Date.now();

  let entries;
  try {
    entries = await fs.readdir(LOGS_DIR);
  } catch (err) {
    log.warn(MODULE, `readdir failed: ${err.message}`);
    return;
  }

  const archives = entries.filter(f =>
    f !== family.file &&
    f.startsWith(base + '.') &&
    f.endsWith('.log')
  );

  for (const archive of archives) {
    const archivePath = path.join(LOGS_DIR, archive);
    try {
      const archiveStat = await fs.stat(archivePath);
      const ageMs = now - archiveStat.mtimeMs;
      if (ageMs > cutoffMs) {
        await fs.unlink(archivePath);
        log.info(MODULE, `${archive} deleted (exceeded ${rotCfg.maxAgeDays}d retention)`);
      }
    } catch (err) {
      log.warn(MODULE, `${archive} cleanup failed: ${err.message}`);
    }
  }
}

async function checkAndRotateLogs() {
  const rotCfg = config.logging?.rotation;
  if (!rotCfg) {
    log.warn(MODULE, 'config.logging.rotation not found; skipping rotation check.');
    return;
  }
  for (const family of FAMILIES) {
    try {
      await rotateFamily(family, rotCfg[family.name]);
    } catch (err) {
      log.warn(MODULE, `${family.name} rotation pass failed: ${err.message}`);
    }
  }
}

module.exports = { checkAndRotateLogs };

'use strict';
const fs     = require('fs');
const path   = require('path');
const AdmZip = require('adm-zip');
const log    = require('./logger');
const config = require('./config');
const pkg              = require('../package.json');
const BACKUP_META_NAME = 'backup-meta.json';

const ROOT_DIR   = path.join(__dirname, '..');
const DATA_DIR   = config.DATA_DIR;
const BACKUP_DIR = config.BACKUP_DIR;

// Architecture: Strict Manifest Mapping handles files across different directories
const BACKUP_MANIFEST = [
  { name: 'auth.json',           dir: DATA_DIR },
  { name: 'blacklist.json',      dir: DATA_DIR },
  { name: 'config.json',         dir: DATA_DIR },
  { name: 'events-ring.json',    dir: DATA_DIR }, // F.9 (O4): SSE ring buffer
  { name: 'history.json',        dir: DATA_DIR },
  { name: 'sessions.json',       dir: DATA_DIR },
  { name: 'system-release.json', dir: DATA_DIR }, // F.9 (O4): release/version ledger
  { name: 'templates.json',      dir: DATA_DIR },
  { name: 'media_queue.json',    dir: ROOT_DIR }  // Critical Addition: Preserves pending webhooks
];

function createBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const backupName = `telgrarr-backup-${pkg.version}-${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);
    
    const zip = new AdmZip();
    let addedCount = 0;
    
    for (const item of BACKUP_MANIFEST) {
      const filePath = path.join(item.dir, item.name);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
        addedCount++;
      }
    }
    
    if (addedCount === 0) {
      throw new Error('No data files found to backup.');
    }
    
    const meta = {
      app: 'telgrarr',
      schema: 1,
      version: pkg.version,
      createdAt: new Date().toISOString(),
      files: BACKUP_MANIFEST
        .filter(i => fs.existsSync(path.join(i.dir, i.name)))
        .map(i => i.name)
    };
    zip.addFile(BACKUP_META_NAME, Buffer.from(JSON.stringify(meta, null, 2)));
    zip.writeZip(backupPath);
    log.audit('Backup', `Backup Create → Success → Filename: [${backupName}] | Items: ${addedCount}`);
    pruneBackups();
    return { success: true, filename: backupName };
  } catch (error) {
    log.error('Backup', `Backup Create → Error → ${error.message}`);
    return { success: false, error: error.message };
  }
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stats.size, createdAt: stats.birthtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    log.error('Backup', `Backup List → Error → ${error.message}`);
    return [];
  }
}

function safeBackupName(name) {
  // Reject path-traversal / non-backup names: backups are bare ".zip" basenames.
  return typeof name === 'string'
    && /^[\w.\-]+\.zip$/.test(name)
    && path.basename(name) === name;
}

function restoreBackup(filename) {
  try {
    if (!safeBackupName(filename)) {
      return { success: false, error: 'Invalid backup filename.' };
    }
    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found.');
    }

    const zip = new AdmZip(backupPath);
    const tempDir = path.join(BACKUP_DIR, '.restore_tmp_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Phase 1 — extract ONLY manifest-named entries (never trusts a zip entry's
      // path, so a crafted backup cannot path-traverse) and validate each parses
      // as JSON BEFORE touching any live file (a corrupt/truncated backup must not
      // brick the app by half-overwriting config.json / auth.json).
      const metaEntry = zip.getEntry(BACKUP_META_NAME);
      if (metaEntry) {
        try {
          const meta = JSON.parse(metaEntry.getData().toString('utf8'));
          log.info('Backup', `Backup Restore → Metadata → version: ${meta.version || '?'} | created: ${meta.createdAt || '?'}`);
          if (meta.version && meta.version !== pkg.version) {
            log.warn('Backup', `Backup Restore → Version Skew → backup ${meta.version} vs app ${pkg.version} (proceeding)`);
          }
        } catch (e) {
          log.warn('Backup', 'Backup Restore → Metadata → unreadable (proceeding)');
        }
      }
      const staged = [];
      for (const item of BACKUP_MANIFEST) {
        const entry = zip.getEntry(item.name);
        if (!entry) continue;
        const data = entry.getData();
        if (item.name.endsWith('.json')) {
          try {
            JSON.parse(data.toString('utf8'));
          } catch (e) {
            throw new Error(`Corrupt entry in backup: ${item.name}`);
          }
        }
        fs.writeFileSync(path.join(tempDir, item.name), data);
        staged.push(item);
      }
      if (staged.length === 0) {
        throw new Error('Backup contains no recognized data files.');
      }

      // Phase 2 — swap staged files into place, only after ALL validated.
      for (const item of staged) {
        fs.renameSync(path.join(tempDir, item.name), path.join(item.dir, item.name));
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    log.audit('Backup', `Backup Restore → Success → Filename: [${filename}]`);
    return { success: true };
  } catch (error) {
    log.error('Backup', `Backup Restore → Error → Filename: [${filename}] | ${error.message}`);
    return { success: false, error: error.message };
  }
}

function deleteBackup(filename) {
  try {
    if (!safeBackupName(filename)) {
      return { success: false, error: 'Invalid backup filename.' };
    }
    const backupPath = path.join(BACKUP_DIR, filename);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      log.audit('Backup', `Backup Delete → Success → Filename: [${filename}]`);
      return { success: true };
    }
    return { success: false, error: 'File not found.' };
  } catch (error) {
    log.error('Backup', `Backup Delete → Error → Filename: [${filename}] | ${error.message}`);
    return { success: false, error: error.message };
  }
}

function pruneBackups() {
  try {
    // R13: config always merges DEFAULTS.backup.retainCount; trust it (no duplicated
    // literal) and an explicit 0 is honored (previously masked to 5 by the || fallback).
    const retainCount = config.backup.retainCount;
    const backups = listBackups();
    if (backups.length > retainCount) {
      const toDelete = backups.slice(retainCount);
      for (const b of toDelete) {
        fs.unlinkSync(path.join(BACKUP_DIR, b.filename));
        log.audit('Backup', `Backup Prune → Success → Filename: [${b.filename}] | Limit: ${retainCount}`);
      }
    }
  } catch (error) {
    log.error('Backup', `Backup Prune → Error → ${error.message}`);
  }
}

function importBackup(buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return { success: false, error: 'Empty or invalid upload.' };
    }
    let zip;
    try {
      zip = new AdmZip(buffer);
    } catch (e) {
      return { success: false, error: 'Uploaded file is not a valid zip archive.' };
    }
    const recognized = BACKUP_MANIFEST.some(item => zip.getEntry(item.name));
    if (!recognized) {
      return { success: false, error: 'Not a recognized Telgrarr backup (no known data files inside).' };
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `telgrarr-imported-${timestamp}.zip`;
    fs.writeFileSync(path.join(BACKUP_DIR, filename), buffer);
    log.audit('Backup', `Backup Import → Success → Filename: [${filename}] | Bytes: ${buffer.length}`);
    pruneBackups();
    return { success: true, filename };
  } catch (error) {
    log.error('Backup', `Backup Import → Error → ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = { createBackup, listBackups, restoreBackup, deleteBackup, pruneBackups, importBackup, safeBackupName };

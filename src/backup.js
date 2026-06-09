'use strict';
const fs     = require('fs');
const path   = require('path');
const AdmZip = require('adm-zip');
const log    = require('./logger');
const config = require('./config');

const ROOT_DIR   = path.join(__dirname, '..');
const DATA_DIR   = config.DATA_DIR;
const BACKUP_DIR = path.join(__dirname, '../backups');

// Architecture: Strict Manifest Mapping handles files across different directories
const BACKUP_MANIFEST = [
  { name: 'auth.json',           dir: DATA_DIR },
  { name: 'blacklist.json',      dir: DATA_DIR },
  { name: 'config.json',         dir: DATA_DIR },
  { name: 'events-ring.json',    dir: DATA_DIR }, // F.9 (O4): SSE ring buffer
  { name: 'history.json',        dir: DATA_DIR },
  { name: 'recovery.json',       dir: DATA_DIR }, // F.9 (O4): system-state recovery marker
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
    const backupName = `telgrarr-backup-${timestamp}.zip`;
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

function restoreBackup(filename) {
  try {
    const backupPath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(backupPath)) {
      throw new Error('Backup file not found.');
    }
    
    const zip = new AdmZip(backupPath);
    const tempDir = path.join(BACKUP_DIR, '.restore_tmp_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    
    // 1. Extract to isolated temp folder (Eliminates Live-Fire Collision)
    zip.extractAllTo(tempDir, true);
    
    // 2. Atomically swap files into their correct locations (DATA_DIR or ROOT_DIR)
    for (const item of BACKUP_MANIFEST) {
      const extractedFile = path.join(tempDir, item.name);
      const targetFile = path.join(item.dir, item.name);
      
      if (fs.existsSync(extractedFile)) {
        fs.renameSync(extractedFile, targetFile);
      }
    }
    
    // 3. Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    log.audit('Backup', `Backup Restore → Success → Filename: [${filename}]`);
    return { success: true };
  } catch (error) {
    log.error('Backup', `Backup Restore → Error → Filename: [${filename}] | ${error.message}`);
    return { success: false, error: error.message };
  }
}

function deleteBackup(filename) {
  try {
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
    const retainCount = config.backup.retainCount || 5;
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

module.exports = { createBackup, listBackups, restoreBackup, deleteBackup, pruneBackups };

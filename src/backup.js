'use strict';
const fs     = require('fs');
const path   = require('path');
const AdmZip = require('adm-zip');
const log    = require('./logger');
const config = require('./config');
const pkg              = require('../package.json');
const BACKUP_META_NAME = 'backup-meta.json';
// BK-FIX-1: crypto for unique restore-temp tokens; restore staging/rollback temp prefixes
// (temp files live in each DESTINATION dir so the final swap is always a same-directory atomic
// rename — never a cross-device EXDEV between BACKUP_DIR and DATA_DIR / PROJECT ROOT).
const crypto = require('crypto');
const RESTORE_STAGE_PREFIX = '.telgrarr-restore-';
const RESTORE_BAK_PREFIX   = '.telgrarr-restorebak-';


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
  // FA-31 / D-5: sessions.json is intentionally NOT in this manifest (Master
  // Architecture Section 4 BACKUP MANIFEST SCOPE update queued at Phase Z). Live
  // session bearer tokens must not travel inside a portable backup archive.
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
    const addedFiles = []; // BK-FIX-1 (F4 DRY): single source of "what landed in the archive".

    for (const item of BACKUP_MANIFEST) {
      const filePath = path.join(item.dir, item.name);
      if (fs.existsSync(filePath)) {
        zip.addLocalFile(filePath);
        addedFiles.push(item.name);
      }
    }

    if (addedFiles.length === 0) {
      throw new Error('No data files found to backup.');
    }

    const meta = {
      app: 'telgrarr',
      schema: 1,
      version: pkg.version,
      createdAt: new Date().toISOString(),
      files: addedFiles.slice() // F4: identical to what was added — cannot drift from the zip.
    };
    zip.addFile(BACKUP_META_NAME, Buffer.from(JSON.stringify(meta, null, 2)));
    zip.writeZip(backupPath);
      // FA-24(ii): adm-zip writeZip has no mode option; chmod immediately after write.
      // No inner try/catch: consistent with the rest of this function -- an unexpected
      // failure here propagates to the outer catch (logged and reported, never silent).
      fs.chmodSync(backupPath, 0o600);

    // BK-FIX-1 (F8): integrity verify — re-open the written archive and confirm it is a
    // complete, readable zip carrying the meta + at least one data entry. Catches a truncated
    // write (ENOSPC / interrupted fs) that would otherwise be reported as a successful backup.
    try {
      const names = new AdmZip(backupPath).getEntries().map(e => e.entryName);
      const ok = names.includes(BACKUP_META_NAME) && addedFiles.some(n => names.includes(n));
      if (!ok) throw new Error('incomplete archive (entries missing on re-read)');
    } catch (vErr) {
      try { fs.unlinkSync(backupPath); } catch (_) {}
      throw new Error(`verification failed: ${vErr.message}`);
    }

    log.audit('Backup', `Backup Create → Success → Filename: [${backupName}] | Items: ${addedFiles.length}`);
    pruneBackups();
    return { success: true, filename: backupName };
  } catch (error) {
    log.error('Backup', `Backup Create → Error → ${error.message}`);
    return { success: false, error: error.message };
  }
}

// BK-FIX-1 (F6): filename-first timestamp. Produced/imported names embed a 14-digit UTC stamp
// (telgrarr-backup-<ver>-YYYYMMDDHHMMSS.zip, legacy telgrarr-backup-YYYYMMDDHHMMSS.zip, and
// telgrarr-imported-YYYYMMDDHHMMSS.zip). stat.birthtime is unreliable on several Linux FS/kernel
// combos (Telgrarr ships to unknown infra) and BOTH the background scheduler and the GUI sort key
// off this value — so derive it from the authoritative filename, falling back to mtime then
// birthtime only for non-conforming names.
function backupTimestamp(filename, stats) {
  const m = /(\d{14})\.zip$/.exec(filename);
  if (m) {
    const s = m[1];
    const t = Date.UTC(
      +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
      +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)
    );
    if (Number.isFinite(t)) return t;
  }
  if (stats && Number.isFinite(stats.mtimeMs)) return stats.mtimeMs;
  if (stats && stats.birthtime) return new Date(stats.birthtime).getTime();
  return 0;
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stats = fs.statSync(path.join(BACKUP_DIR, f));
        const ts = backupTimestamp(f, stats);
        return { filename: f, size: stats.size, createdAt: new Date(ts).toISOString() };
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

// BK-FIX-1 (F5): sweep orphaned restore temp files (stage + bak) from every destination dir.
// Scoped strictly to our own prefixes; idempotent; safe because restore is fully synchronous
// and single-instance (RD-8), so no concurrent restore's temps can be in flight.
function cleanupRestoreTemps() {
  const dirs = [...new Set(BACKUP_MANIFEST.map(i => i.dir))];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(RESTORE_STAGE_PREFIX) || f.startsWith(RESTORE_BAK_PREFIX)) {
          try { fs.rmSync(path.join(dir, f), { force: true }); } catch (_) {}
        }
      }
    } catch (_) { /* dir unreadable — skip */ }
  }
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

    // Clear any orphaned temp files from a prior hard-killed restore before we begin.
    cleanupRestoreTemps();

    // Metadata: log + one-time version-skew warn; restores are backward-compatible (proceed).
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

    // Phase 1 — read ONLY manifest-named entries (never trusts a zip entry's stored path, so a
    // crafted backup cannot path-traverse), validate each JSON parses, and stage it as a temp
    // file IN ITS OWN DESTINATION DIRECTORY. Per-destination staging keeps the Phase-2 swap a
    // same-dir atomic rename — never a cross-device EXDEV between BACKUP_DIR and DATA_DIR / ROOT.
    const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const staged = []; // { dir, name, stagePath }
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
      const stagePath = path.join(item.dir, `${RESTORE_STAGE_PREFIX}${token}-${item.name}`);
      fs.writeFileSync(stagePath, data, { mode: 0o600 });
      staged.push({ dir: item.dir, name: item.name, stagePath });
    }
    if (staged.length === 0) {
      throw new Error('Backup contains no recognized data files.');
    }

    // Phase 2 — transactional, all-or-nothing swap. For each staged file: move the current live
    // file aside (.bak, same dir), then atomically rename the staged file into place. On ANY
    // mid-swap failure, roll EVERY touched file back to its pre-restore state — a failed restore
    // can never leave a half-overwritten data set (FU-9, enforced across DATA_DIR + PROJECT ROOT).
    const applied = []; // { livePath, bakPath|null, swapped }
    try {
      for (const s of staged) {
        const livePath = path.join(s.dir, s.name);
        let bakPath = null;
        if (fs.existsSync(livePath)) {
          bakPath = path.join(s.dir, `${RESTORE_BAK_PREFIX}${token}-${s.name}`);
          fs.renameSync(livePath, bakPath);
        }
        applied.push({ livePath, bakPath, swapped: false });
        fs.renameSync(s.stagePath, livePath);
        applied[applied.length - 1].swapped = true;
      }
    } catch (swapErr) {
      for (let i = applied.length - 1; i >= 0; i--) {
        const a = applied[i];
        try {
          if (a.swapped) fs.rmSync(a.livePath, { force: true });
          if (a.bakPath) fs.renameSync(a.bakPath, a.livePath);
        } catch (_) { /* best-effort; the .bak is left in place if even rollback fails */ }
      }
      throw swapErr;
    } finally {
      for (const s of staged) {
        try { if (fs.existsSync(s.stagePath)) fs.rmSync(s.stagePath, { force: true }); } catch (_) {}
      }
    }

    // Success — drop the pre-restore .bak files.
    for (const a of applied) {
      if (a.bakPath) { try { fs.rmSync(a.bakPath, { force: true }); } catch (_) {} }
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
    fs.writeFileSync(path.join(BACKUP_DIR, filename), buffer, { mode: 0o600 });
    log.audit('Backup', `Backup Import → Success → Filename: [${filename}] | Bytes: ${buffer.length}`);
    pruneBackups();
    return { success: true, filename };
  } catch (error) {
    log.error('Backup', `Backup Import → Error → ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = { createBackup, listBackups, restoreBackup, deleteBackup, pruneBackups, importBackup, safeBackupName };

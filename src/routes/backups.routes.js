'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const backupEngine = require('../backup');
const log = require('../logger');
const { requestRestart, isRestartCapable } = require('../services/restart');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const history = require('../history');
const UPLOAD_LIMIT = '25mb';

router.get('/backups', requireAuth, (req, res) => {
  try {
    const files = backupEngine.listBackups();
    res.json({ success: true, backups: files });
  } catch (err) {
    log.error('Backup', `Backups List → Error → ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups', requireAuth, (req, res) => {
  try {
    const result = backupEngine.createBackup();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    log.error('Backup', `Backup Create → Error → ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups/upload', requireAuth, express.raw({ type: 'application/zip', limit: UPLOAD_LIMIT }), (err, req, res, next) => {
  // R2: body-parser size/parse errors must map to a clean status (413 when over
  // the size limit) instead of bubbling to a generic 500. A 4-arg handler is an
  // Express error handler: it is SKIPPED on a successful parse (the normal handler
  // below runs) and only fires when express.raw rejects the body.
  const tooLarge = err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413);
  log.error('Backup', 'Backup Import → Rejected → ' + (tooLarge ? 'over size limit' : 'bad upload'));
  return res.status(tooLarge ? 413 : 400).json({ success: false, error: tooLarge ? 'Backup file is too large (max 25 MB).' : ((err && err.message) || 'Invalid upload.') });
}, (req, res) => {
  try {
    const result = backupEngine.importBackup(req.body);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    log.error('Backup', `Backup Import → Error → ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/backups/restore/:filename', requireAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const result = backupEngine.restoreBackup(filename);
    
    if (result.success) {
      const capable = isRestartCapable();
      if (capable) {
        log.audit('Backup', `Backup Restore → Complete → Triggering Restart`);
        res.on('finish', () => requestRestart('backup-restore'));
      } else {
        // No respawn is coming on this deployment: hot-reload live config AND
        // history from the just-restored disk state NOW, so a later config.save()
        // or addHistory() merges onto restored truth (never stale pre-restore
        // memory) and GET /settings + GET /history serve restored values.
        // Restart-tier config values still need a manual restart, so needsRestart
        // stays true. (F2 — closes the restore-clobber window; F13d —
        // closes the FA-25 history residual on the same non-capable path.)
        config.reload();
        history.reload();
        log.audit('Backup', `Backup Restore → Complete → Hot-reloaded (manual restart required)`);
      }
      res.json({ success: true, needsRestart: true, restartCapable: capable });
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    log.error('Backup', `Backup Restore → Error → ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/backups/:filename', requireAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const result = backupEngine.deleteBackup(filename);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    log.error('Backup', `Backup Delete → Error → ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/backups/:filename/download', requireAuth, (req, res) => {
  const { filename } = req.params;
  if (!backupEngine.safeBackupName(filename)) {
    return res.status(400).json({ success: false, error: 'Invalid backup filename.' });
  }
  const filePath = path.join(config.BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Backup not found.' });
  }
  log.audit('Backup', `Backup Download → Success → Filename: [${filename}]`);
  res.download(filePath, filename);
});

module.exports = router;

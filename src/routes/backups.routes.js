'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const backupEngine = require('../backup');
const log = require('../logger');
const { requestRestart } = require('../services/restart');
const path = require('path');
const fs = require('fs');
const config = require('../config');
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

router.post('/backups/upload', requireAuth, express.raw({ type: 'application/zip', limit: UPLOAD_LIMIT }), (req, res) => {
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
      log.audit('Backup', `Backup Restore → Complete → Triggering Restart`);
      res.on('finish', () => requestRestart('backup-restore'));
      res.json({ success: true, needsRestart: true });
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

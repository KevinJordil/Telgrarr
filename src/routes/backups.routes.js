'use strict';
const express = require('express');
const { exec } = require('child_process');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const backupEngine = require('../backup');
const log = require('../logger');

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

router.post('/backups/restore/:filename', requireAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const result = backupEngine.restoreBackup(filename);
    
    if (result.success) {
      log.audit('Backup', `Backup Restore → Complete → Triggering Restart`);
      res.json({ success: true, needsRestart: true });
      
      // Agnostic restart command survives Node/NVM upgrades
      setTimeout(() => {
        exec('pm2 restart telgrarr', (err) => {
          if (err) {
            log.error('Backup', `PM2 Restart → Error → ${err.message}`);
          } else {
            log.audit('Backup', `PM2 Restart → Success → System back online`);
          }
        });
      }, 1000);
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

module.exports = router;

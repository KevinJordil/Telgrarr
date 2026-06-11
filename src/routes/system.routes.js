'use strict';
// [H2.1a] System control routes (HTTP only; logic in services/restart.js).
const express = require('express');
const router  = express.Router();
const log     = require('../logger');
const { requireAuth } = require('../middlewares/auth');
const restart = require('../services/restart');
const APP_VERSION = require('../../package.json').version; // version SSoT (E.3/RD-7)

router.get('/system/info', requireAuth, (req, res) => {
  res.json({ restartCapable: restart.isRestartCapable(), version: APP_VERSION });
});

// Refuses (409) when no respawning supervisor exists, so the GUI shows manual
// guidance instead of polling a process that will never return (SD-4).
router.post('/system/restart', requireAuth, (req, res) => {
  if (!restart.isRestartCapable()) {
    log.audit('System', 'Restart \u2192 Rejected \u2192 not capable (manual restart required)');
    return res.status(409).json({
      success: false,
      restartCapable: false,
      error: 'Automatic restart unavailable on this deployment. Restart the service manually.',
    });
  }
  res.json({ success: true, restarting: true });
  res.on('finish', () => restart.requestRestart('gui'));
});

module.exports = router;

'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const log = require('../logger');
const { requireAuth } = require('../middlewares/auth');

const INSTALL_ROOT = path.resolve(__dirname, '../../');
const APP_VERSION  = require('../../package.json').version;   // E.3/RD-7: version SSoT = package.json

let RELEASE_DATA = { version: 'unknown', tier: 'unknown', buildTimestamp: 'unknown' };

try {
  const releasePath = path.join(__dirname, '../../data/system-release.json');
  if (fs.existsSync(releasePath)) {
    RELEASE_DATA = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  }
} catch (err) {
  log.error('About', 'Failed to load system-release.json: ' + err.message);
}

router.get('/about', requireAuth, (req, res) => {
  try {
    res.json({
      appName:       'Telgrarr',
      version:       APP_VERSION,
      tier:          RELEASE_DATA.tier,
      buildTimestamp: RELEASE_DATA.buildTimestamp,
      nodeVersion:   process.version,
      platform:      process.platform,
      uptimeSeconds: Math.floor(process.uptime()),
      installRoot:   INSTALL_ROOT,
      recoverCmd:    'cd ' + INSTALL_ROOT + ' && npm run recover'
    });
  } catch (err) {
    log.error('About', 'Route error: ' + err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;

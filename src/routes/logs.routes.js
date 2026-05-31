'use strict';

const express  = require('express');
const router   = express.Router();
const { requireAuth }       = require('../middlewares/auth');
const { getFilteredLogs }   = require('../logger');
const { getHistory }        = require('../history');

// ── GET /api/history ─────────────────────────────────────────────────────────

router.get('/history', requireAuth, (req, res) => {
  res.json(getHistory());
});

// ── GET /api/logs ─────────────────────────────────────────────────────────────

router.get('/logs', requireAuth, (req, res) => {
  const { limit, level, module, since } = req.query;
  res.json(getFilteredLogs({
    limit:  limit  ? parseInt(limit, 10) : 100,
    level:  level  || undefined,
    module: module || undefined,
    since:  since  || undefined,
  }));
});

module.exports = router;

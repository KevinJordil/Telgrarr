'use strict';
const express     = require('express');
const router      = express.Router();
const log         = require('../logger');
const events      = require('../events');
const EVENT_TYPES = require('../../gui/src/shared/events.json');
const { requireAuth }              = require('../middlewares/auth');
const { drainQueue }               = require('../queue');
const { getQueueState, runSweep }  = require('../sweeper');

// ── GET /api/queue/status ────────────────────────────────────────────────────
router.get('/queue/status', requireAuth, (req, res) => {
  const state = getQueueState();
  res.json({ active: state.active, expiresAt: state.expiresAt, isSweeping: state.isSweeping });
});

// ── POST /api/queue/flush ────────────────────────────────────────────────────
router.post('/queue/flush', requireAuth, async (req, res) => {
  const state = getQueueState();
  if (state.isSweeping) {
    return res.status(409).json({ error: 'Sweep currently in progress. Please wait.' });
  }
  if (!state.active) {
    return res.status(400).json({ error: 'No active queue to flush.' });
  }
  log.audit('Queue', 'Manual flush triggered via GUI.');
  events.emit(EVENT_TYPES.QUEUE_FLUSH, 'info', 'Queue', 'Queue flushed manually', {});
  res.json({ success: true });
  setImmediate(() => runSweep());
});

// ── POST /api/queue/clear ────────────────────────────────────────────────────
router.post('/queue/clear', requireAuth, async (req, res) => {
  const state = getQueueState();
  if (state.isSweeping) {
    return res.status(409).json({ error: 'Cannot clear queue while a sweep is in progress.' });
  }
  try {
    const drained = await drainQueue();
    log.audit('Queue', `Queue cleared manually via GUI. ${drained.length} item(s) discarded.`);
    events.emit(
      EVENT_TYPES.QUEUE_CLEARED,
      'warn',
      'Queue',
      `Queue cleared — ${drained.length} item(s) discarded`,
      { count: drained.length }
    );
    res.json({ success: true, discarded: drained.length });
  } catch (err) {
    log.error('Queue', `Clear failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

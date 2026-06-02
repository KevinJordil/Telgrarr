'use strict';

const express  = require('express');
const router   = express.Router();
const events   = require('../events');
const { activeSessions, requireAuth } = require('../middlewares/auth');
const { getQueueState }  = require('../sweeper');
const { issue, consume } = require('../auth/stream-ticket');

// C.6b / S2 — issue a short-lived single-use ticket for the EventSource connect
// (browsers can't set an auth header on EventSource). requireAuth = current Bearer.
router.get('/stream-ticket', requireAuth, function(req, res) {
  res.json({ ticket: issue() });
});

router.get('/stream', function(req, res) {
  const now = Date.now();
  // C.6b: single-use ticket (primary) OR legacy session token (kept until C.6c).
  let authed = false;
  if (req.query.ticket) authed = consume(req.query.ticket, now);
  if (!authed && req.query.token) {
    const expiry = activeSessions.get(req.query.token);
    authed = !!expiry && now <= expiry;
  }
  if (!authed) return res.status(401).end();

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  function sseWrite(eventType, data) {
    res.write('event: ' + eventType + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  }

  var recent = events.getRecentEvents(15);
  for (var i = 0; i < recent.length; i++) {
    sseWrite(recent[i].type, recent[i]);
  }

  var qs = getQueueState();
  if (qs.active) {
    sseWrite('queue.timer_started', {
      type: 'queue.timer_started', level: 'info', module: 'Sweeper',
      message: 'Batch timer active', data: { expiresAt: qs.expiresAt },
      timestamp: new Date().toISOString(),
    });
  }

  function onEvent(e) { sseWrite(e.type, e); }
  events.bus.on('event', onEvent);

  var heartbeat = setInterval(function() {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', function() {
    events.bus.off('event', onEvent);
    clearInterval(heartbeat);
  });
});

module.exports = router;

'use strict';

const express  = require('express');
const router   = express.Router();
const events   = require('../events');
const { activeSessions } = require('../middlewares/auth');
const { getQueueState }  = require('../sweeper');

router.get('/stream', function(req, res) {
  const token  = req.query.token;
  const expiry = activeSessions.get(token);
  if (!expiry || Date.now() > expiry) return res.status(401).end();

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

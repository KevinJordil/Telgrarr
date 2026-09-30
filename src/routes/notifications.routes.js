'use strict';
const express = require('express');
const config = require('../config');
const log = require('../logger');
const { tokenValid } = require('../auth/webhook-token');
const { requireAuth } = require('../middlewares/auth');
const store = require('../notifications/store');
const { normalizeSeerr, normalizeTautulli, render } = require('../notifications/model');
const hooks = express.Router();
const api = express.Router();

function receiver(source, normalize) {
  hooks.post(`/:token/${source}`, async (req, res) => {
    if (!tokenValid(req.params.token, config.WEBHOOK_SECRET)) return res.sendStatus(401);
    if (!config.notifications?.enabled) return res.status(409).json({ error: 'Unified notifications are disabled' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'Expected a JSON object' });
    let event;
    try { event = normalize(req.body); }
    catch { return res.status(400).json({ error: 'Missing or invalid event fields' }); }
    if (!event) return res.json({ ignored: true });
    try {
      // Acknowledge only after the event is durable. Retries use the same deduplication key.
      const result = await store.enqueue(event);
      return res.status(result.accepted ? 202 : 200).json(result);
    } catch (error) {
      log.warn('Notifications', 'Webhook could not be persisted');
      return res.status(error.status || 503).json({ error: 'Notification queue unavailable' });
    }
  });
}
receiver('seerr', normalizeSeerr);
receiver('tautulli', normalizeTautulli);
api.get('/notifications/status', requireAuth, (req, res) => {
  try { res.json({ enabled: config.notifications.enabled, ...store.status() }); }
  catch { res.status(503).json({ error: 'Notification store unavailable' }); }
});
api.post('/notifications/retry', requireAuth, async (req, res) => {
  try { res.json({ retried: await store.retryBlocked() }); }
  catch { res.status(503).json({ error: 'Notification store unavailable' }); }
});
api.post('/notifications/preview', requireAuth, (req, res) => {
  try {
    const event = req.body?.event;
    if (!event || !['request', 'available'].includes(event.event)) return res.status(400).json({ error: 'Expected a request or availability event' });
    // Offline preview: no enrichment, queue mutation or Telegram request.
    res.json({ caption: render(event, config) });
  } catch { res.status(400).json({ error: 'Invalid event or notification template' }); }
});
module.exports = { hooks, api };

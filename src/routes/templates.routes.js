'use strict';
const express    = require('express');
const router     = express.Router();
const templates  = require('../templates');
const log        = require('../logger');
const events     = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
const { requireAuth } = require('../middlewares/auth');
const { buildCatalog } = require('../templates/composer-catalog');

// ── GET /api/templates ────────────────────────────────────────────────────────
router.get('/templates', requireAuth, (req, res) => {
  res.json(templates.getTemplates());
});

// ── POST /api/templates/active ────────────────────────────────────────────────
router.post('/templates/active', requireAuth, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!mode || typeof mode !== 'string')
      return res.status(400).json({ error: 'mode must be a non-empty string' });
    const result = await templates.setActiveMode(mode);
    events.emit(EVENT_TYPES.TEMPLATE_ACTIVE_CHANGED, 'info', 'Templates', `Active mode changed to: ${mode}`, { mode });
    res.json({ success: true, templates: result });
  } catch (err) {
    log.error('Templates', `Set active failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/templates/slots ─────────────────────────────────────────────────
router.post('/templates/slots', requireAuth, async (req, res) => {
  try {
    const slot   = req.body;
    const result = await templates.addSlot(slot);
    events.emit(EVENT_TYPES.TEMPLATE_SLOT_ADDED, 'info', 'Templates', `Slot added: ${slot.name}`, { id: slot.id });
    res.json({ success: true, templates: result });
  } catch (err) {
    log.error('Templates', `Add slot failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ── PATCH /api/templates/slots/:id ───────────────────────────────────────────
router.patch('/templates/slots/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const patch   = req.body;
    const result  = await templates.updateSlot(id, patch);
    events.emit(EVENT_TYPES.TEMPLATE_SLOT_UPDATED, 'info', 'Templates', `Slot updated: ${id}`, { id });
    res.json({ success: true, templates: result });
  } catch (err) {
    log.error('Templates', `Update slot failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/templates/slots/:id ──────────────────────────────────────────
router.delete('/templates/slots/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result  = await templates.deleteSlot(id);
    events.emit(EVENT_TYPES.TEMPLATE_SLOT_DELETED, 'info', 'Templates', `Slot deleted: ${id}`, { id });
    res.json({ success: true, templates: result });
  } catch (err) {
    log.error('Templates', `Delete slot failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// --- GET /api/templates/layout + PUT /api/templates/layout (P5a) ---
router.get('/templates/layout', requireAuth, (req, res) => {
  res.json(templates.getLayout());
});

router.put('/templates/layout', requireAuth, async (req, res) => {
  try {
    const { layout } = req.body;
    const result = await templates.setLayout(layout);
    events.emit(EVENT_TYPES.TEMPLATE_LAYOUT_CHANGED, 'info', 'Templates', 'Caption layout updated', { sonarr: result.sonarr.length, radarr: result.radarr.length });
    res.json({ success: true, layout: result });
  } catch (err) {
    log.error('Templates', `Set layout failed: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

// --- GET /api/templates/catalog (P5c-1): composer view-model assembled DRY from
// layout-schema + layout-fragments (orderable/prefix elements, icon choices, languages). ---
router.get('/templates/catalog', requireAuth, (req, res) => {
  res.json(buildCatalog());
});

module.exports = router;

'use strict';
const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../middlewares/auth');
const log             = require('../logger');
const history         = require('../history');

const VALID_TYPES = new Set(['show', 'movie']);
const VALID_SORTS = new Set(['newest', 'oldest', 'title-asc', 'title-desc']);

// -- GET /api/history ---------------------------------------------------------
router.get('/history', requireAuth, (req, res) => {
  const { type, search, sort, page, pageSize } = req.query;

  if (type !== undefined && !VALID_TYPES.has(type)) {
    return res.status(400).json({ error: 'Invalid type. Must be "show" or "movie".' });
  }
  if (sort !== undefined && !VALID_SORTS.has(sort)) {
    return res.status(400).json({ error: 'Invalid sort. Must be one of: newest, oldest, title-asc, title-desc.' });
  }

  let pageNum = 1;
  if (page !== undefined) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: 'Invalid page. Must be a positive integer.' });
    }
    pageNum = n;
  }

  let pageSizeNum = 24;
  if (pageSize !== undefined) {
    const n = Number(pageSize);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return res.status(400).json({ error: 'Invalid pageSize. Must be between 1 and 100.' });
    }
    pageSizeNum = n;
  }

  const searchStr = search !== undefined
    ? String(search).trim().slice(0, 200) || undefined
    : undefined;

  try {
    const result = history.getAll({
      type:     type     || undefined,
      search:   searchStr,
      sort:     sort     || undefined,
      page:     pageNum,
      pageSize: pageSizeNum,
    });
    res.json(result);
  } catch (err) {
    log.error('History', 'List -> failed -> ' + err.message);
    res.status(500).json({ error: 'Failed to retrieve history.' });
  }
});

// -- GET /api/history/stats ---------------------------------------------------
// Registered BEFORE /:id — Express matches literal before param.
router.get('/history/stats', requireAuth, (req, res) => {
  try {
    res.json(history.stats());
  } catch (err) {
    log.error('History', 'Stats -> failed -> ' + err.message);
    res.status(500).json({ error: 'Failed to retrieve history stats.' });
  }
});

// -- GET /api/history/:id -----------------------------------------------------
router.get('/history/:id', requireAuth, (req, res) => {
  try {
    const entry = history.getById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Entry not found.' });
    res.json(entry);
  } catch (err) {
    log.error('History', 'GetById -> failed -> ' + err.message);
    res.status(500).json({ error: 'Failed to retrieve history entry.' });
  }
});

// -- DELETE /api/history (clear-all) ------------------------------------------
// Registered BEFORE /:id — DELETE /api/history (no trailing segment) must not
// be consumed by the param route.
router.delete('/history', requireAuth, async (req, res) => {
  if (!req.body || req.body.confirm !== 'CLEAR_HISTORY') {
    return res.status(400).json({ error: 'Body must contain { "confirm": "CLEAR_HISTORY" }.' });
  }
  try {
    const removed = await history.clear();
    log.audit('History', 'Clear -> removed ' + removed + ' entries');
    res.json({ success: true, removed });
  } catch (err) {
    log.error('History', 'Clear -> failed -> ' + err.message);
    res.status(500).json({ error: 'Failed to clear history.' });
  }
});

// -- DELETE /api/history/:id --------------------------------------------------
router.delete('/history/:id', requireAuth, async (req, res) => {
  try {
    const removed = await history.removeById(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Entry not found.' });
    log.audit('History', 'Delete -> removed ' + req.params.id);
    res.json({ success: true });
  } catch (err) {
    log.error('History', 'Delete -> failed -> ' + err.message);
    res.status(500).json({ error: 'Failed to remove history entry.' });
  }
});

module.exports = router;

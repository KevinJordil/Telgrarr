'use strict';
const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const config     = require('../config');
const log        = require('../logger');
const events     = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
const blacklist  = require('../blacklist');
const { requireAuth } = require('../middlewares/auth');
const { createLimit } = require('../utils/p-limit.js');

const BLACKLIST_TITLES_CONCURRENCY = 5;

// ── GET /api/blacklist ───────────────────────────────────────────────────────
router.get('/blacklist', requireAuth, (req, res) => {
  res.json(blacklist.getAll());
});

// ── POST /api/blacklist/ids/add ──────────────────────────────────────────────
router.post('/blacklist/ids/add', requireAuth, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!id || isNaN(Number(id))) return res.status(400).json({ error: 'Invalid id' });
    await blacklist.addId(type, id);
    log.audit('Blacklist', `Blacklist ID Add → Success → Type: [${type}] | ID: [${id}]`);
    events.emit(EVENT_TYPES.BLACKLIST_ID_ADDED, 'info', 'Blacklist', `${type} id:${id} blacklisted`, { type, id });
    res.json({ success: true });
  } catch (err) {
    log.error('Blacklist', `Blacklist ID Add → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blacklist/ids/remove ───────────────────────────────────────────
router.post('/blacklist/ids/remove', requireAuth, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!id || isNaN(Number(id))) return res.status(400).json({ error: 'Invalid id' });
    await blacklist.removeId(type, id);
    log.audit('Blacklist', `Blacklist ID Remove → Success → Type: [${type}] | ID: [${id}]`);
    events.emit(EVENT_TYPES.BLACKLIST_ID_REMOVED, 'info', 'Blacklist', `${type} id:${id} removed`, { type, id });
    res.json({ success: true });
  } catch (err) {
    log.error('Blacklist', `Blacklist ID Remove → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blacklist/paths/add ────────────────────────────────────────────
router.post('/blacklist/paths/add', requireAuth, async (req, res) => {
  try {
    const { type, path } = req.body;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!path || typeof path !== 'string' || !path.trim()) return res.status(400).json({ error: 'Invalid path' });
    await blacklist.addPath(type, path);
    log.audit('Blacklist', `Blacklist Path Add → Success → Type: [${type}] | Path: [${path.trim()}]`);
    events.emit(EVENT_TYPES.BLACKLIST_PATH_ADDED, 'info', 'Blacklist', `${type} path blocked: ${path.trim()}`, { type, path });
    res.json({ success: true });
  } catch (err) {
    log.error('Blacklist', `Blacklist Path Add → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/blacklist/paths/remove ─────────────────────────────────────────
router.post('/blacklist/paths/remove', requireAuth, async (req, res) => {
  try {
    const { type, path } = req.body;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!path || typeof path !== 'string' || !path.trim()) return res.status(400).json({ error: 'Invalid path' });
    await blacklist.removePath(type, path);
    log.audit('Blacklist', `Blacklist Path Remove → Success → Type: [${type}] | Path: [${path.trim()}]`);
    events.emit(EVENT_TYPES.BLACKLIST_PATH_REMOVED, 'info', 'Blacklist', `${type} path unblocked: ${path.trim()}`, { type, path });
    res.json({ success: true });
  } catch (err) {
    log.error('Blacklist', `Blacklist Path Remove → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blacklist/search ────────────────────────────────────────────────
router.get('/blacklist/search', requireAuth, async (req, res) => {
  try {
    const { type, q } = req.query;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!q || !q.trim()) return res.status(400).json({ error: 'Missing search query' });
    const bl = blacklist.getAll();
    if (type === 'sonarr') {
      const response = await axios.get(config.sonarr.baseUrl + '/api/v3/series/lookup', {
        headers: { 'X-Api-Key': config.sonarr.apiKey },
        params:  { term: q.trim() },
        timeout: 10000,
      });
      return res.json((response.data || []).slice(0, 20).map(s => ({
        id:             s.id,
        title:          s.title,
        year:           s.year           || null,
        posterUrl:      (s.images || []).find(i => i.coverType === 'poster')?.remoteUrl || null,
        blacklisted:    bl.sonarr.ids.includes(Number(s.id)),
        path:           s.path           || null,
        rootFolderPath: s.rootFolderPath || null,
      })));
    } else {
      const response = await axios.get(config.radarr.baseUrl + '/api/v3/movie/lookup', {
        headers: { 'X-Api-Key': config.radarr.apiKey },
        params:  { term: q.trim() },
        timeout: 10000,
      });
      return res.json((response.data || []).slice(0, 20).map(m => ({
        id:             m.id,
        title:          m.title,
        year:           m.year           || null,
        posterUrl:      m.remotePoster   || (m.images || []).find(i => i.coverType === 'poster')?.remoteUrl || null,
        blacklisted:    bl.radarr.ids.includes(Number(m.id)),
        path:           m.path           || null,
        rootFolderPath: m.rootFolderPath || null,
      })));
    }
  } catch (err) {
    log.error('Blacklist', `Blacklist Search → Error → Type: [${req.query.type}] | Query: [${req.query.q}] | ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blacklist/rootfolders ───────────────────────────────────────────
router.get('/blacklist/rootfolders', requireAuth, async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const bl      = blacklist.getAll();
    const baseUrl = type === 'sonarr' ? config.sonarr.baseUrl : config.radarr.baseUrl;
    const apiKey  = type === 'sonarr' ? config.sonarr.apiKey  : config.radarr.apiKey;
    const response = await axios.get(baseUrl + '/api/v3/rootfolder',
      { headers: { 'X-Api-Key': apiKey }, timeout: 8000 });
    res.json((response.data || []).map(f => ({
      id:          f.id,
      path:        f.path,
      label:       f.path.split('/').filter(Boolean).pop(),
      freeSpace:   f.freeSpace || null,
      blacklisted: bl[type].paths.includes(f.path),
    })));
  } catch (err) {
    log.error('Blacklist', `Blacklist Rootfolders → Error → Type: [${req.query.type}] | ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/blacklist/titles ────────────────────────────────────────────────
// Reverse-enrichment only: blacklist.json stores bare IDs (no title/poster).
// Resolves each blacklisted id against the source *arr's own single-resource
// endpoint so the GUI can render a real list. Bounded via p-limit — never
// unbounded fan-out against the operator's own *arr instance. Each id is
// isolated: one dead/deleted id degrades to available:false, never fails
// the whole response (same read-only-enrichment class as tmdb.js/omdb.js).
router.get('/blacklist/titles', requireAuth, async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !['sonarr', 'radarr'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const ids      = blacklist.getAll()[type].ids;
    const baseUrl  = type === 'sonarr' ? config.sonarr.baseUrl : config.radarr.baseUrl;
    const apiKey   = type === 'sonarr' ? config.sonarr.apiKey  : config.radarr.apiKey;
    const resource = type === 'sonarr' ? '/api/v3/series/' : '/api/v3/movie/';
    const limit = createLimit(BLACKLIST_TITLES_CONCURRENCY);
    const items = await Promise.all(ids.map(id => limit(async () => {
      try {
        const response = await axios.get(`${baseUrl}${resource}${id}`, {
          headers: { 'X-Api-Key': apiKey },
          timeout: 10000,
        });
        const d = response.data || {};
        return {
          id,
          title:     d.title,
          year:      d.year || null,
          posterUrl: (type === 'radarr' ? d.remotePoster : null) || (d.images || []).find(i => i.coverType === 'poster')?.remoteUrl || null,
          available: true,
        };
      } catch (err) {
        log.error('Blacklist', `Blacklist Titles → Lookup failed → Type: [${type}] | ID: [${id}] | ${err.message}`);
        return { id, title: null, year: null, posterUrl: null, available: false };
      }
    })));
    res.json(items);
  } catch (err) {
    log.error('Blacklist', `Blacklist Titles → Error → Type: [${req.query.type}] | ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

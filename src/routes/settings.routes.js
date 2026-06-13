'use strict';

const express = require('express');
const router = express.Router();

const config = require('../config');
const log = require('../logger');
const events = require('../events');
const EVENT_TYPES = require('../../shared/events.json');
const { requireAuth } = require('../middlewares/auth');
const { getMaskedSettings, getFieldSources } = require('../settings/serializer');
const { validateSettings } = require('../settings/validator');
const { needsRestart, portChangeRequiresPreflight } = require('../settings/policy');
const { pickSecret, maskSecret } = require('../settings/secrets');
const {
  testTelegram, testSonarr, testRadarr, testEmby, testSeerr, testOmdb,
  testTranslatorAi, testTranslatorDeepl,
  AI_DEFAULT_ENDPOINT, AI_DEFAULT_MODEL
} = require('../services/connection-tester');
const { SETTINGS_SCHEMA } = require('../settings-schema');
const { requestRestart } = require('../services/restart');
const { generateWebhookSecret } = require('../auth/webhook-token');
const { isPortAvailable } = require('../services/port-check');

// ── GET /api/settings/schema ─────────────────────────────────────────────────
router.get('/settings/schema', requireAuth, (req, res) => {
  res.json(SETTINGS_SCHEMA);
});

// ── GET /api/settings ────────────────────────────────────────────────────────
router.get('/settings', requireAuth, (req, res) => {
  res.json(getMaskedSettings());
});

// GET /api/settings/meta (H4.2) - per-field env-source annotation (envVar hint).
// Read-only, auth-gated, SEPARATE from GET /settings so the settings response
// stays byte-identical and the annotation can never echo back into config.save().
router.get('/settings/meta', requireAuth, (req, res) => {
  res.json({ fields: getFieldSources() });
});

// ── POST /api/settings ───────────────────────────────────────────────────────
router.post('/settings', requireAuth, async (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const errs = validateSettings(incoming);
    if (errs.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errs });
    }

    // H4.3a: port pre-flight. If the operator is changing to a NEW, non-env-managed
    // port, best-effort test-bind it BEFORE persisting so a save never arms a restart
    // into the H0 bind-failure exit. TOCTOU-tolerant; H0 remains the backstop.
    if (portChangeRequiresPreflight(incoming)) {
      const targetHost = (incoming.listenerHost !== undefined && !config.envOverrides.HOST)
        ? incoming.listenerHost
        : config.HOST;
      const free = await isPortAvailable(incoming.listenerPort, targetHost);
      if (!free) {
        log.warn('Settings', `Port Pre-flight → Refused → port ${incoming.listenerPort} not bindable`);
        return res.status(409).json({ error: `Port ${incoming.listenerPort} looks busy - pick another`, field: 'listenerPort' });
      }
      log.info('Settings', `Port Pre-flight → OK → port ${incoming.listenerPort} bindable`);
    }

    const restart = needsRestart(incoming);
    await config.save(incoming);
    const sections = Object.keys(incoming).join(', ');

    log.info('Settings', `Settings Update → Success → Sections: [${sections}] | Restart: ${restart}`);
    events.emit(
      EVENT_TYPES.SETTINGS_SAVED,
      'info',
      'Config',
      `Settings updated: ${sections}`,
      { sections, restart }
    );

    if (restart) {
      log.audit('Settings', `System Restart → Pending → Restart-critical key changed in sections: [${sections}]`);
      events.emit(
        EVENT_TYPES.SETTINGS_RESTART,
        'warn',
        'Config',
        'Restart required — port/host/log-level changed',
        {}
      );

      res.on('finish', () => requestRestart('settings-save'));

      res.json({
        success: true,
        hotReloaded: false,
        needsRestart: true,
        settings: getMaskedSettings(),
      });
    } else {
      res.json({
        success: true,
        hotReloaded: true,
        needsRestart: false,
        settings: getMaskedSettings(),
      });
    }
  } catch (err) {
    log.error('Settings', `Settings Update → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/settings/test/telegram ─────────────────────────────────────────
router.post('/settings/test/telegram', requireAuth, async (req, res) => {
  const botToken = pickSecret(req.body && req.body.botToken, config.telegram.botToken);
  const chatId = (req.body && req.body.chatId) ? req.body.chatId : config.telegram.chatId;

  const result = await testTelegram(botToken, chatId);
  if (result.success) {
    log.info('Settings', 'Integration Test (Telegram) → Success → Message sent');
    return res.json({ success: true, message: result.message });
  } else {
    log.warn('Settings', `Integration Test (Telegram) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/sonarr ───────────────────────────────────────────
router.post('/settings/test/sonarr', requireAuth, async (req, res) => {
  const rawUrl = (req.body && req.body.baseUrl) ? req.body.baseUrl : config.sonarr.baseUrl;
  const apiKey = pickSecret(req.body && req.body.apiKey, config.sonarr.apiKey);

  const result = await testSonarr(rawUrl, apiKey);
  if (result.success) {
    log.info('Settings', 'Integration Test (Sonarr) → Success → System reachable');
    return res.json({ success: true, version: result.version, appName: result.appName });
  } else {
    log.warn('Settings', `Integration Test (Sonarr) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/radarr ───────────────────────────────────────────
router.post('/settings/test/radarr', requireAuth, async (req, res) => {
  const rawUrl = (req.body && req.body.baseUrl) ? req.body.baseUrl : config.radarr.baseUrl;
  const apiKey = pickSecret(req.body && req.body.apiKey, config.radarr.apiKey);

  const result = await testRadarr(rawUrl, apiKey);
  if (result.success) {
    log.info('Settings', 'Integration Test (Radarr) → Success → System reachable');
    return res.json({ success: true, version: result.version, appName: result.appName });
  } else {
    log.warn('Settings', `Integration Test (Radarr) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/emby ─────────────────────────────────────────────
router.post('/settings/test/emby', requireAuth, async (req, res) => {
  const refreshUrl = (req.body && req.body.refreshUrl) ? req.body.refreshUrl : config.emby.refreshUrl;
  const apiKey = pickSecret(req.body && req.body.apiKey, config.emby.apiKey);

  const result = await testEmby(refreshUrl, apiKey);
  if (result.success) {
    log.info('Settings', 'Integration Test (Emby) → Success → Ping OK');
    return res.json({ success: true, message: result.message });
  } else {
    log.warn('Settings', `Integration Test (Emby) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/seerr ────────────────────────────
router.post('/settings/test/seerr', requireAuth, async (req, res) => {
  const rawUrl = (req.body && req.body.baseUrl) ? req.body.baseUrl : config.seerr.baseUrl;
  const result = await testSeerr(rawUrl);
  if (result.success) {
    log.info('Settings', 'Integration Test (Seerr) → Success → System reachable');
    return res.json({ success: true, version: result.version });
  } else {
    log.warn('Settings', `Integration Test (Seerr) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/omdb ─────────────────────────────────────────────
router.post('/settings/test/omdb', requireAuth, async (req, res) => {
  const apiKey = pickSecret(req.body && req.body.apiKey, config.omdb.apiKey);

  const result = await testOmdb(apiKey);
  if (result.success) {
    log.info('Settings', 'Integration Test (OMDb) → Success → Key accepted');
    return res.json({ success: true, message: result.message });
  } else {
    log.warn('Settings', `Integration Test (OMDb) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/translator-ai ────────────────────────────────────
router.post('/settings/test/translator-ai', requireAuth, async (req, res) => {
  const apiKey = pickSecret(req.body && req.body.apiKey, config.translator.apiKey);
  const endpoint = (req.body && req.body.endpoint) ? req.body.endpoint : (config.translator.endpoint || AI_DEFAULT_ENDPOINT);
  const model = (req.body && req.body.model) ? req.body.model : (config.translator.model || AI_DEFAULT_MODEL);

  const result = await testTranslatorAi(endpoint, model, apiKey);
  if (result.success) {
    log.info('Settings', 'Integration Test (Translator AI) → Success → Endpoint reachable, key accepted');
    return res.json({ success: true, message: result.message });
  } else {
    log.warn('Settings', `Integration Test (Translator AI) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/test/translator-deepl ─────────────────────────────────
router.post('/settings/test/translator-deepl', requireAuth, async (req, res) => {
  const deeplKey = pickSecret(req.body && req.body.deeplApiKey, config.translator.deeplApiKey);

  const result = await testTranslatorDeepl(deeplKey);
  if (result.success) {
    const used = result.character_count;
    const limit = result.character_limit;
    log.info('Settings', 'Integration Test (DeepL) → Success → Key valid');
    return res.json({ success: true, message: `DeepL key valid — ${used ?? '?'}/${limit ?? '?'} characters used.` });
  } else {
    log.warn('Settings', `Integration Test (DeepL) → Failed → ${result.error}`);
    return res.status(400).json({ success: false, error: result.error });
  }
});

// ── POST /api/settings/reveal ────────────────────
// SD-9: return exactly ONE unmasked secret on explicit, auth-gated action.
// Never a bulk dump; only schema-declared secret fields are revealable; the
// secret value is never written to logs.
const SECRET_KEYS = new Set(
  SETTINGS_SCHEMA.flatMap(s => s.fields)
    .filter(f => f.type === 'secret')
    .map(f => f.key)
);
// H5.1 (SD-9): webhookSecret lives OUTSIDE the schema (generated/stored top-level
// by config.js); whitelist it explicitly so URL-copy/eye reuse the same
// one-at-a-time reveal path.
SECRET_KEYS.add('webhookSecret');
router.post('/settings/reveal', requireAuth, (req, res) => {
  const key = req.body && req.body.key;
  if (typeof key !== 'string' || !SECRET_KEYS.has(key)) {
    log.warn('Settings', 'Secret Reveal → Rejected → Unknown or non-secret field');
    return res.status(400).json({ error: 'Unknown or non-secret field' });
  }
  // H5.1: webhookSecret reveals the EFFECTIVE secret (config.WEBHOOK_SECRET, env
  // wins) so the copied URL is the one the /hooks guard actually accepts.
  const value = key === 'webhookSecret'
    ? config.WEBHOOK_SECRET
    : key.split('.').reduce((o, k) => (o != null ? o[k] : undefined), config);
  log.info('Settings', `Secret Reveal → Success → Field: ${key}`);
  return res.json({ key, value: typeof value === 'string' ? value : '' });
});

// ──── GET /api/settings/webhook (H5.1) ────
// SD-7: SUGGESTED webhook URLs - best-effort (the address the operator is browsing
// from; TRUST_PROXY-aware via req.protocol) and clearly editable in the GUI, never
// asserted as truth. The secret segment is MASKED here; the full URL is composed
// client-side only after an explicit SD-9 reveal.
router.get('/settings/webhook', requireAuth, (req, res) => {
  const secretSet = !!config.WEBHOOK_SECRET;
  const masked = secretSet ? maskSecret(config.WEBHOOK_SECRET) : '';
  // H5.3a (SD-14): prefer the operator-configured publicBaseUrl (hot-reloaded, read
  // per-request); else the address this request arrived on. baseSource tells the GUI
  // whether the base is configured or auto-detected.
  const configuredBase = (config.publicBaseUrl && config.publicBaseUrl.trim())
    ? config.publicBaseUrl.trim().replace(/\/+$/, '')
    : '';
  const suggestedBase = configuredBase || `${req.protocol}://${req.get('host')}`;
  res.json({
    suggestedBase,
    baseSource: configuredBase ? 'configured' : 'derived',
    paths: {
      sonarr: secretSet ? `/hooks/${masked}/sonarr` : '',
      radarr: secretSet ? `/hooks/${masked}/radarr` : '',
    },
    secretSet,
    envManaged: !!config.envOverrides.WEBHOOK_SECRET,
  });
});

// ──── POST /api/settings/webhook/regenerate (H5.1) ────
// Credential rotation. env-managed secret => 409 (SD-1: env wins; the file tier is
// inert). WEBHOOK_SECRET is boot-resolved, so rotation is restart-required and
// reuses the POST /settings finish-hook restart convention (ONE convention). The
// old secret keeps working until the restart lands, then is rejected.
router.post('/settings/webhook/regenerate', requireAuth, async (req, res) => {
  try {
    if (config.envOverrides.WEBHOOK_SECRET) {
      log.warn('Settings', 'Webhook Regenerate → Refused → Secret is env-managed (WEBHOOK_SECRET)');
      return res.status(409).json({ error: 'Webhook secret is managed by the environment (WEBHOOK_SECRET) - change it there', envManaged: true });
    }
    const secret = generateWebhookSecret();
    await config.save({ webhookSecret: secret });
    log.audit('Settings', 'Webhook Regenerate → Success → New secret persisted, restart required');
    events.emit(
      EVENT_TYPES.SETTINGS_RESTART,
      'warn',
      'Config',
      'Restart required - webhook secret regenerated',
      {}
    );
    res.on('finish', () => requestRestart('webhook-regenerate'));
    res.json({ success: true, needsRestart: true });
  } catch (err) {
    log.error('Settings', `Webhook Regenerate → Error → ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

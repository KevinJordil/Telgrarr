// @ts-check
'use strict';
const fs              = require('fs');
const path            = require('path');
const { generateWebhookSecret } = require('./auth/webhook-token'); // pure crypto, no cycle
const writeFileAtomic = require('write-file-atomic');
const log             = require('./logger');
const { SETTINGS_SCHEMA } = require('./settings-schema');
const { isMasked }        = require('./settings/secrets');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
// PR-1: data/ is gitignored, so a fresh clone (or fresh DATA_DIR) has no such
// directory. Ensure it exists at boot so loadFromDisk(), save(), and every other
// DATA_DIR consumer never ENOENT. recursive:true is idempotent (no-op if present).
fs.mkdirSync(DATA_DIR, { recursive: true });

const { REQUEST_TEMPLATE, AVAILABLE_TEMPLATE } = require('./notifications/model');

const DEFAULTS = {
  listenerPort:  3400,
  listenerHost:  '0.0.0.0',
  publicBaseUrl: '',
  corsOrigin:    '',
  trustProxy:    '',
  cookieSecure:  'auto',
  batchWindowMs: 180000,
  queueFile:     path.join(DATA_DIR, 'media_queue.json'),
    queue:         { maxItems: 1000 },
  sonarr:     { baseUrl: '', apiKey: '' },
  telegram:   { botToken: '', chatId: '', delayMs: 6000 },
  emby:       { refreshUrl: '', apiKey: '' },
  radarr:     { baseUrl: '', apiKey: '' },
  tmdb:       { apiKey: '' },
  seerr:      { baseUrl: '', apiKey: '' },
  tautulli:   { baseUrl: '', apiKey: '' },
  notifications: { enabled: false, summaryLength: 350, requestTemplate: REQUEST_TEMPLATE, availableTemplate: AVAILABLE_TEMPLATE },
  omdb:       { apiKey: '' },
  translator: {
    endpoint:    'https://models.inference.ai.azure.com/chat/completions',
    model:       'gpt-4o-mini',
    apiKey:      '',
    deeplApiKey: '',
    googleApiKey: '',
    googleEndpoint: 'https://translation.googleapis.com/language/translate/v2',
    targetLang:  'ar',
    aiEnabled:    true,
    deeplEnabled: true,
    googleEnabled: true,
    shortPlot: false,
    aiOnlyPlot: false
  },
  mediaCache: {
    ttlDays:    30,
    maxEntries: 500
  },
  backup: {
    enabled: true,
    intervalDays: 7,
    retainCount: 5
  },
  logging: {
    level: 'info',
    rotation: {
      app:   { maxSizeMb: 10, maxAgeDays: 7   },
      error: { maxSizeMb: 10, maxAgeDays: 30  },
      audit: { maxSizeMb: 5,  maxAgeDays: 365 }
    }
  },
  history: {
    maxItems:    500,
    maxAgeDays:  0
  }
};

// G.1: REQUIRED_CREDENTIALS is DERIVED from settings-schema bootRequired hints —
// the single source of truth for the boot/health required-credential set and its
// labels. Order follows schema (= GUI Settings) section order, which is the order
// surfaced in /health checks.config.missing. Add a required credential by setting
// bootRequired on its schema field; never re-list it here.
const REQUIRED_CREDENTIALS = SETTINGS_SCHEMA.flatMap(section =>
  (/** @type {any[]} */ (section.fields || []))
    .filter(field => field.bootRequired)
    .map(field => {
      const dot = field.key.indexOf('.');
      return [field.key.slice(0, dot), field.key.slice(dot + 1), field.bootRequired];
    })
);

/**
 * @param {*} [cfg] config object (defaults to live config)
 * @returns {string[]} labels of missing required credentials
 */
function getMissingCredentials(cfg) {
  if (!cfg) cfg = config;
  const missing = [];
  const required = cfg.notifications?.enabled
    ? [...REQUIRED_CREDENTIALS.filter(([section]) => section === 'telegram'), ['tautulli', 'baseUrl', 'Tautulli base URL'], ['tautulli', 'apiKey', 'Tautulli API key']]
    : REQUIRED_CREDENTIALS;
  for (const [section, key, label] of required) {
    const val = cfg[section]?.[key];
    if (!val || String(val).trim() === '') missing.push(label);
  }
  return missing;
}

/**
 * @param {*} cfg
 * @param {string} context "boot" | "reload"
 * @returns {void}
 */
function validateRequiredCredentials(cfg, context) {
  const missing = getMissingCredentials(cfg);
  if (missing.length === 0) return;
  missing.forEach(label => log.warn('Config', `Missing required credential: ${label}`));
  if (context === 'boot') {
    log.warn('Config', 'App is booting with missing credentials. Please use the GUI to configure them.');
  } else {
    log.warn('Config', `Missing required credentials: ${missing.join(', ')} — continuing without them; configure via the GUI (also reported by /health).`);
  }
}

/**
 * @param {*} cfg
 * @returns {void}
 */
function warnIncompleteEmby(cfg) {
  if (cfg.emby?.refreshUrl && !cfg.emby?.apiKey) {
    log.warn('Config', 'Emby refreshUrl set without apiKey — Emby library refresh disabled until apiKey is provided.');
  }
}

/**
 * @param {*} base
 * @param {*} [override]
 * @returns {*} deep-merged copy
 */
function deepMerge(base, override) {
  const out = Object.assign({}, base);
  for (const key of Object.keys(override ?? {})) {
    if (
      override[key] !== null &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key])
    ) {
      out[key] = deepMerge(base[key] ?? {}, override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

/**
 * @param {string} [context] "boot" | "reload"
 * @returns {*} merged config
 */
function loadFromDisk(context = 'boot') {
  if (!fs.existsSync(CONFIG_FILE)) {
    log.warn('Config', 'data/config.json not found — booting with empty defaults.');
    return deepMerge({}, DEFAULTS);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    // FA-1: ignore any disk-persisted queueFile -- the boot-resolved default always wins.
    const { templates, DEFAULTS: _d, reload: _r, save: _s, queueFile: _qf, ...clean } = raw;
    const merged = deepMerge(DEFAULTS, clean);
    validateRequiredCredentials(merged, context);
    warnIncompleteEmby(merged);
    return merged;
  } catch (err) {
    if (context === 'boot') {
      log.error('Config', `Failed to read config.json: ${err.message}. Using defaults.`);
      return deepMerge({}, DEFAULTS);
    }
    throw err;
  }
}

/** Strip volatile, never-persisted keys before an atomic write (shared by save()
 *  and the first-boot secret bootstrap so both emit an identical on-disk shape). */
function stripVolatile(obj) {
  // FA-1 (amended OSR-3): queueFile is DATA_DIR-derived at boot -- still never persisted.
  const { DEFAULTS: _d, reload: _r, save: _s, templates: _t, queueFile: _q, ...rest } = obj;
  return rest;
}

/** SD-18: seed/generate the webhook secret on FIRST boot ONLY when the config.json
 *  file tier does not already have one (idempotent -- a saved config.webhookSecret is
 *  a no-op). WEBHOOK_SECRET env, when present, SEEDS this first-boot value only; the
 *  result (seeded or generated) is PERSISTED to config.json and is FILE-TIER-
 *  AUTHORITATIVE thereafter -- env no longer wins at runtime, and the secret is always
 *  GUI-regenerable. Removes the "401 until you hand-edit config.json" trap on a fresh
 *  install without weakening closed-by-default (C.5): the only transition is unset ->
 *  a freshly generated/seeded secret, persisted once. */
function ensureWebhookSecret() {
  if (config.webhookSecret) return;                    // already saved -> idempotent
  const envSecret = process.env.WEBHOOK_SECRET;
  const seeded = (envSecret != null && envSecret !== '');
  const secret = seeded ? envSecret : generateWebhookSecret(); // single home: auth/webhook-token.js
  config.webhookSecret = secret;
  try {
    writeFileAtomic.sync(
      CONFIG_FILE,
      JSON.stringify(stripVolatile(config), null, 2),
      { mode: 0o600 }   // PR-2: holds secrets -> owner-only
    );
    log.audit('Config', 'Webhook secret initialized on first boot \u2192 persisted to config.json \u2192 webhook routes authenticated');
  } catch (err) {
    log.error('Config', `Failed to persist generated webhook secret: ${err.message}`);
  }
}

/** Phase 1 (G1): one-time boot migration -- clamp any legacy telegram.delayMs below
 *  the schema floor up to that floor. Reads the floor from SETTINGS_SCHEMA (R13: never
 *  hardcode the number a second time). Idempotent: no-op when already at/above floor. */
function migrateDelayFloor() {
  const field = SETTINGS_SCHEMA.flatMap(s => s.fields).find(f => f.key === 'telegram.delayMs');
  if (!field) return;
  const floor = field.min;
  if (config.telegram && typeof config.telegram.delayMs === 'number' && config.telegram.delayMs < floor) {
    const legacy = config.telegram.delayMs;
    config.telegram.delayMs = floor;
    try {
      writeFileAtomic.sync(
        CONFIG_FILE,
        JSON.stringify(stripVolatile(config), null, 2),
        { mode: 0o600 }
      );
      log.audit('Config', `Pacing floor migration \u2192 clamped delayMs ${legacy} \u2192 ${floor} \u2192 legacy value was unsafe`);
    } catch (err) {
      log.error('Config', `Failed to persist pacing floor migration: ${err.message}`);
    }
  }
}

const config = loadFromDisk('boot');
ensureWebhookSecret();
migrateDelayFloor();
log.setLevel(config.logging && config.logging.level);

/**
 * @returns {void} hot-reload config in place
 */
function reload() {
  const fresh = loadFromDisk('reload');
  for (const key of Object.keys(config)) {
    if (typeof config[key] !== 'function') delete config[key];
  }
  for (const key of Object.keys(fresh)) {
    config[key] = (
      fresh[key] &&
      typeof fresh[key] === 'object' &&
      !Array.isArray(fresh[key])
    )
      ? Object.assign({}, fresh[key])
      : fresh[key];
  }
  log.setLevel(config.logging && config.logging.level);
  log.info('Config', 'Hot-reload complete — all modules updated.');
}

/**
 * @param {*} current
 * @param {*} incoming
 * @returns {boolean}
 */
function isDirty(current, incoming) {
  const merged = deepMerge(current, incoming);
  for (const key of Object.keys(incoming)) {
    if (typeof incoming[key] === 'object' && incoming[key] !== null && !Array.isArray(incoming[key])) {
      for (const subKey of Object.keys(incoming[key])) {
        if (JSON.stringify(current[key]?.[subKey]) !== JSON.stringify(merged[key]?.[subKey])) return true;
      }
    } else {
      if (JSON.stringify(current[key]) !== JSON.stringify(merged[key])) return true;
    }
  }
  return false;
}

/**
 * @param {*} incoming settings patch
 * @returns {Promise<*>} saved/merged config
 */
async function save(incoming) {
  // H1.2 (SD-6): never persist a mask. For each schema secret field, if the
  // incoming value is the masked sentinel, drop it so the stored value is kept
  // (deepMerge falls back to current). Runs before isDirty so an untouched
  // secret cannot mark the save dirty or overwrite the real key on disk.
  if (incoming && typeof incoming === 'object') {
    for (const section of SETTINGS_SCHEMA) {
      for (const field of section.fields) {
        if (field.type !== 'secret') continue;
        const keys = field.key.split('.');
        let obj = incoming;
        for (let i = 0; i < keys.length - 1 && obj != null; i++) obj = obj[keys[i]];
        const leaf = keys[keys.length - 1];
        if (obj != null && isMasked(obj[leaf])) delete obj[leaf];
      }
    }
  }
  const current = {};
  for (const key of Object.keys(config)) {
    if (typeof config[key] !== 'function') current[key] = config[key];
  }
  if (!isDirty(current, incoming)) {
    log.info('Config', 'Save skipped — no changes detected.');
    return current;
  }
  const merged = deepMerge(current, incoming);
  const toWrite = stripVolatile(merged);
  await new Promise((resolve, reject) => {
    writeFileAtomic(
      CONFIG_FILE,
      JSON.stringify(toWrite, null, 2), { mode: 0o600 }, /* PR-2: holds secrets — owner-only */
      (err) => { if (err) reject(err); else resolve(); }
    );
  });
  reload();
  log.info('Config', 'Settings saved and reloaded successfully.');
  return merged;
}

config.reload   = reload;
config.save     = save;
// FA-12: non-enumerable — save()'s Object.keys(config) snapshot and reload()'s
// Object.keys(config) delete-loop must never see (and thus never destroy) this
// property. Same B.1 pattern as DATA_DIR/PORT/etc below. A require-time-only
// consumer (connection-tester.js) was never at risk; a call-time consumer
// (translator.js:179) now survives every reload() instead of TypeError-ing
// mid-cascade after the first settings save.
Object.defineProperty(config, 'DEFAULTS', { value: DEFAULTS, enumerable: false, configurable: true });
config.getMissingCredentials = getMissingCredentials;
// ── B.1: resolved environment layer (additive; env -> file -> DEFAULTS) ──────
// Non-enumerable: save() never persists these and reload() never wipes them.
// CONFIG_FILE already derives from DATA_DIR. Consumers wired in later steps; env
// names finalized in B.7.
Object.defineProperty(config, 'DATA_DIR',    { value: DATA_DIR, enumerable: false, configurable: true });
Object.defineProperty(config, 'PORT',        { value: (process.env.PORT != null && process.env.PORT !== '') ? Number(process.env.PORT) : config.listenerPort, enumerable: false, configurable: true });
Object.defineProperty(config, 'HOST',        { value: (process.env.HOST != null && process.env.HOST !== '') ? process.env.HOST : config.listenerHost, enumerable: false, configurable: true });
Object.defineProperty(config, 'CORS_ORIGIN', { value: process.env.CORS_ORIGIN != null ? process.env.CORS_ORIGIN : (config.corsOrigin || ''), enumerable: false, configurable: true });
Object.defineProperty(config, 'TRUST_PROXY', { value: process.env.TRUST_PROXY != null ? process.env.TRUST_PROXY : (config.trustProxy || ''), enumerable: false, configurable: true });
// Webhook auth secret: config.json webhookSecret -> '' (env only SEEDS first boot). Empty =>
// routes return 401 (closed-by-default). Resolved at boot like the B.1 vars: a
// RESTART is required to pick up a change (hot-reload does not recompute these).
Object.defineProperty(config, 'WEBHOOK_SECRET', { value: (config.webhookSecret || ''), enumerable: false, configurable: true });
// C.7 / RD-4: cookie Secure policy. 'auto' (default) => Secure when the request is
// HTTPS (req.secure / X-Forwarded-Proto); 'true'/'false' force it. Boot-resolved.
Object.defineProperty(config, 'COOKIE_SECURE', { value: (process.env.COOKIE_SECURE != null && process.env.COOKIE_SECURE !== '') ? process.env.COOKIE_SECURE : (config.cookieSecure || 'auto'), enumerable: false, configurable: true });
// C10: logs directory path. Env-resolved at boot (RESTART required to pick up a change).
Object.defineProperty(config, 'LOGS_DIR',      { value: (process.env.LOGS_DIR != null && process.env.LOGS_DIR !== '') ? process.env.LOGS_DIR : path.join(__dirname, '../logs'), enumerable: false, configurable: true });
// FU-4: backups directory path. Env-resolved at boot (RESTART required); default
// <root>/backups — joins DATA_DIR/LOGS_DIR in the env model. Non-enumerable so
// save() never persists it and reload() never wipes it.
Object.defineProperty(config, 'BACKUP_DIR',    { value: (process.env.BACKUP_DIR != null && process.env.BACKUP_DIR !== '') ? process.env.BACKUP_DIR : path.join(__dirname, '../backups'), enumerable: false, configurable: true });

// H3.1: env-override transparency. Which B.1 portability fields are env-sourced.
// Predicates MIRROR the B.1 resolution above and must stay in sync with it.
// Non-enumerable like the B.1 vars, so it never leaks into serialized config (ND-7).
const _envSet = (k) => process.env[k] != null && process.env[k] !== '';
Object.defineProperty(config, 'envOverrides', {
  value: {
    PORT:           _envSet('PORT'),
    HOST:           _envSet('HOST'),
    // CORS_ORIGIN / TRUST_PROXY: an explicitly-set EMPTY value is still env-managed
    // (RD-2), so match the resolution's "!= null" check (no "!== ''").
    CORS_ORIGIN:    process.env.CORS_ORIGIN != null,
    TRUST_PROXY:    process.env.TRUST_PROXY != null,
    WEBHOOK_SECRET: _envSet('WEBHOOK_SECRET'),
    COOKIE_SECURE:  _envSet('COOKIE_SECURE'),
  },
  enumerable: false,
  configurable: true,
});

module.exports = config;

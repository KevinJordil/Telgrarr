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

const DEFAULTS = {
  listenerPort:  3400,
  listenerHost:  '0.0.0.0',
  publicBaseUrl: '',
  corsOrigin:    '',
  trustProxy:    '',
  cookieSecure:  'auto',
  batchWindowMs: 180000,
  queueFile:     path.join(__dirname, '../media_queue.json'),
  sonarr:     { baseUrl: '', apiKey: '', includePlot: true },
  telegram:   { botToken: '', chatId: '', delayMs: 3000 },
  emby:       { refreshUrl: '', apiKey: '' },
  radarr:     { baseUrl: '', apiKey: '', includePlot: true },
  tmdb:       { apiKey: '', language: 'ar-SA' },
  seerr:      { baseUrl: '' },
  omdb:       { apiKey: '' },
  translator: {
    endpoint:    'https://models.inference.ai.azure.com/chat/completions',
    model:       'gpt-4o-mini',
    apiKey:      '',
    deeplApiKey: ''
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
  for (const [section, key, label] of REQUIRED_CREDENTIALS) {
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
  missing.forEach(label => log.error('Config', `Missing required credential: ${label}`));
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
    const { templates, DEFAULTS: _d, reload: _r, save: _s, ...clean } = raw;
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
  const { DEFAULTS: _d, reload: _r, save: _s, templates: _t, ...rest } = obj;
  return rest;
}

/** H5.0 (SD-11/SD-1): generate the webhook secret on FIRST boot ONLY when neither env
 *  nor the config.json file tier supplies one (strictly idempotent). An env-set secret
 *  is used as-is and NEVER persisted/overwritten (precedence env > file). Removes the
 *  "401 until you hand-edit config.json" trap on a fresh install without weakening
 *  closed-by-default (C.5): the only transition is unset -> a freshly generated secret. */
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

const config = loadFromDisk('boot');
ensureWebhookSecret();
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
config.DEFAULTS = DEFAULTS;
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

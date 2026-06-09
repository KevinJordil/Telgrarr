'use strict';
const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');
const log             = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  listenerPort:  3400,
  listenerHost:  '0.0.0.0',
  batchWindowMs: 180000,
  queueFile:     path.join(__dirname, '../media_queue.json'),
  sonarr:     { baseUrl: '', apiKey: '' },
  telegram:   { botToken: '', chatId: '', delayMs: 3000 },
  emby:       { refreshUrl: '', apiKey: '' },
  radarr:     { baseUrl: '', apiKey: '' },
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

const REQUIRED_CREDENTIALS = [
  ['sonarr',   'apiKey',     'Sonarr API key'],
  ['sonarr',   'baseUrl',    'Sonarr base URL'],
  ['radarr',   'apiKey',     'Radarr API key'],
  ['radarr',   'baseUrl',    'Radarr base URL'],
  ['telegram', 'botToken',   'Telegram bot token'],
  ['telegram', 'chatId',     'Telegram chat ID'],
  ['tmdb',     'apiKey',     'TMDB API key'],
];

function getMissingCredentials(cfg) {
  if (!cfg) cfg = config;
  const missing = [];
  for (const [section, key, label] of REQUIRED_CREDENTIALS) {
    const val = cfg[section]?.[key];
    if (!val || String(val).trim() === '') missing.push(label);
  }
  return missing;
}

function validateRequiredCredentials(cfg, context) {
  const missing = getMissingCredentials(cfg);
  if (missing.length === 0) return;
  missing.forEach(label => log.error('Config', `Missing required credential: ${label}`));
  if (context === 'boot') {
    log.warn('Config', 'App is booting with missing credentials. Please use the GUI to configure them.');
  } else {
    throw new Error(`Missing required credentials: ${missing.join(', ')}`);
  }
}

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
    return merged;
  } catch (err) {
    if (context === 'boot') {
      log.error('Config', `Failed to read config.json: ${err.message}. Using defaults.`);
      return deepMerge({}, DEFAULTS);
    }
    throw err;
  }
}

const config = loadFromDisk('boot');
log.setLevel(config.logging && config.logging.level);

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

async function save(incoming) {
  const current = {};
  for (const key of Object.keys(config)) {
    if (typeof config[key] !== 'function') current[key] = config[key];
  }
  if (!isDirty(current, incoming)) {
    log.info('Config', 'Save skipped — no changes detected.');
    return current;
  }
  const merged = deepMerge(current, incoming);
  validateRequiredCredentials(merged, 'reload');
  const { DEFAULTS: _d, reload: _r, save: _s, templates: _t, ...toWrite } = merged;
  await new Promise((resolve, reject) => {
    writeFileAtomic(
      CONFIG_FILE,
      JSON.stringify(toWrite, null, 2),
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
Object.defineProperty(config, 'CORS_ORIGIN', { value: process.env.CORS_ORIGIN != null ? process.env.CORS_ORIGIN : '', enumerable: false, configurable: true });
Object.defineProperty(config, 'TRUST_PROXY', { value: process.env.TRUST_PROXY != null ? process.env.TRUST_PROXY : '', enumerable: false, configurable: true });
// C.5: webhook auth secret (env -> config.json webhookSecret -> ''). Empty =>
// routes return 401 (closed-by-default). Resolved at boot like the B.1 vars: a
// RESTART is required to pick up a change (hot-reload does not recompute these).
Object.defineProperty(config, 'WEBHOOK_SECRET', { value: (process.env.WEBHOOK_SECRET != null && process.env.WEBHOOK_SECRET !== '') ? process.env.WEBHOOK_SECRET : (config.webhookSecret || ''), enumerable: false, configurable: true });
// C.7 / RD-4: cookie Secure policy. 'auto' (default) => Secure when the request is
// HTTPS (req.secure / X-Forwarded-Proto); 'true'/'false' force it. Boot-resolved.
Object.defineProperty(config, 'COOKIE_SECURE', { value: (process.env.COOKIE_SECURE != null && process.env.COOKIE_SECURE !== '') ? process.env.COOKIE_SECURE : 'auto', enumerable: false, configurable: true });
// C10: logs directory path. Env-resolved at boot (RESTART required to pick up a change).
Object.defineProperty(config, 'LOGS_DIR',      { value: (process.env.LOGS_DIR != null && process.env.LOGS_DIR !== '') ? process.env.LOGS_DIR : path.join(__dirname, '../logs'), enumerable: false, configurable: true });

module.exports = config;

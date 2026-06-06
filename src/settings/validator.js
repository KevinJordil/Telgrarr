'use strict';

const { SETTINGS_SCHEMA } = require('../settings-schema');

// Non-schema operational-field bounds. These fields (listenerPort and backup.*)
// are validated explicitly outside the SETTINGS_SCHEMA-driven loop because
// they're admin/operational and not in the Settings UI. Moving them into the
// schema would surface them in the GUI, which is out of scope.
const LISTENER_PORT_MIN   = 1025;
const LISTENER_PORT_MAX   = 65534;
const BACKUP_INTERVAL_MIN = 1;
const BACKUP_INTERVAL_MAX = 30;
const BACKUP_RETAIN_MIN   = 1;
const BACKUP_RETAIN_MAX   = 20;

const RULES = {
  // F.4: URL rule restricted to http(s) only — every consumer (Sonarr, Radarr,
  // Emby, Seerr, TMDB translator endpoint) is HTTP-based. Accepting other
  // schemes (ftp://, file://, etc.) was a latent footgun. Authorized parity
  // break per roadmap §3 — paired with updated test.
  url: (val) => {
    try {
      const u = new URL(val);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  telegramToken: (val) => /^\d+:[A-Za-z0-9_-]{30,}$/.test(val),
  chatId: (val) => /^-?\d+$/.test(String(val))
};

function getVal(obj, keyPath) {
  if (!obj) return undefined;
  return keyPath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function validateSettings(body) {
  const errors = [];

  // 1. NON-SCHEMA EXPLICIT BLOCK
  if (body.listenerPort !== undefined) {
    if (!Number.isInteger(body.listenerPort) || body.listenerPort < LISTENER_PORT_MIN || body.listenerPort > LISTENER_PORT_MAX) {
      errors.push({ field: 'listenerPort', message: `Must be an integer between ${LISTENER_PORT_MIN} and ${LISTENER_PORT_MAX}` });
    }
  }

  // Backup is not in schema but MUST be validated for behavioral parity
  if (body.backup) {
    if (body.backup.intervalDays !== undefined) {
      if (!Number.isInteger(body.backup.intervalDays) || body.backup.intervalDays < BACKUP_INTERVAL_MIN || body.backup.intervalDays > BACKUP_INTERVAL_MAX) {
        errors.push({ field: 'backup.intervalDays', message: `Must be an integer between ${BACKUP_INTERVAL_MIN} and ${BACKUP_INTERVAL_MAX}` });
      }
    }
    if (body.backup.retainCount !== undefined) {
      if (!Number.isInteger(body.backup.retainCount) || body.backup.retainCount < BACKUP_RETAIN_MIN || body.backup.retainCount > BACKUP_RETAIN_MAX) {
        errors.push({ field: 'backup.retainCount', message: `Must be an integer between ${BACKUP_RETAIN_MIN} and ${BACKUP_RETAIN_MAX}` });
      }
    }
    if (body.backup.enabled !== undefined && typeof body.backup.enabled !== 'boolean') {
      errors.push({ field: 'backup.enabled', message: 'Must be a boolean' });
    }
  }

  // 2. SCHEMA-DRIVEN BLOCK
  for (const section of SETTINGS_SCHEMA) {
    for (const field of section.fields) {
      const val = getVal(body, field.key);
      if (val === undefined) continue;

      if (field.integer) {
         if (!Number.isInteger(val) || val < field.min || val > field.max) {
           // F.4: per-field override via schema.errorMessage; falls back to
           // the generic template. Was a key-specific if/else (R04 violation).
           const msg = field.errorMessage || `Must be an integer between ${field.min} and ${field.max}`;
           errors.push({ field: field.key, message: msg });
         }
         continue;
      }

      if (field.type === 'select') {
         const validOptions = field.options.map(o => o.value);
         if (!validOptions.includes(val)) {
           errors.push({ field: field.key, message: `Must be one of: ${validOptions.join(', ')}` });
         }
         continue;
      }

      const strVal = String(val);
      const isWhitespace = strVal.trim() === '';

      if (field.required) {
         if (isWhitespace) {
            errors.push({ field: field.key, message: 'Cannot be empty' });
            continue;
         }
      } else {
         // F.4: per-field opt-in checks via schema hints. Was a key-specific
         // if/else on field.key (R04 violation).
         if (field.nonWhitespaceIfProvided) {
            if (val !== '' && isWhitespace) {
               errors.push({ field: field.key, message: 'Cannot be empty if provided' });
            }
         } else if (field.mustBeString) {
            if (val !== '' && typeof val !== 'string') {
               errors.push({ field: field.key, message: 'Must be a string' });
            }
         }
         
         if (val === '' || isWhitespace) {
            continue;
         }
      }

      if (field.rule) {
         if (field.rule === 'url') {
            if (!RULES.url(val)) {
               errors.push({ field: field.key, message: 'Must be a valid URL' });
            }
         } else if (field.rule === 'telegramToken') {
            if (!RULES.telegramToken(val)) {
               errors.push({ field: field.key, message: 'Invalid Telegram bot token format' });
            }
         } else if (field.rule === 'chatId') {
            if (!RULES.chatId(val)) {
               errors.push({ field: field.key, message: 'Must be a valid numeric chat ID' });
            }
         }
      }
    }
  }

  return errors;
}

module.exports = { validateSettings };

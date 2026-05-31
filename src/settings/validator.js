'use strict';

const { SETTINGS_SCHEMA } = require('../settings-schema');

const RULES = {
  url: (val) => {
    try {
      new URL(val);
      return true;
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
    if (!Number.isInteger(body.listenerPort) || body.listenerPort < 1025 || body.listenerPort > 65534) {
      errors.push({ field: 'listenerPort', message: 'Must be an integer between 1025 and 65534' });
    }
  }

  // Backup is not in schema but MUST be validated for behavioral parity
  if (body.backup) {
    if (body.backup.intervalDays !== undefined) {
      if (!Number.isInteger(body.backup.intervalDays) || body.backup.intervalDays < 1 || body.backup.intervalDays > 30) {
        errors.push({ field: 'backup.intervalDays', message: 'Must be an integer between 1 and 30' });
      }
    }
    if (body.backup.retainCount !== undefined) {
      if (!Number.isInteger(body.backup.retainCount) || body.backup.retainCount < 1 || body.backup.retainCount > 20) {
        errors.push({ field: 'backup.retainCount', message: 'Must be an integer between 1 and 20' });
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
           // Inject legacy hardcoded messages for precise parity
           if (field.key === 'batchWindowMs') {
             errors.push({ field: field.key, message: 'Must be between 30000 (30s) and 1800000 (30min)' });
           } else if (field.key === 'telegram.delayMs') {
             errors.push({ field: field.key, message: 'Must be between 500ms and 10000ms' });
           } else {
             errors.push({ field: field.key, message: `Must be an integer between ${field.min} and ${field.max}` });
           }
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
         if (field.key === 'translator.endpoint' || field.key === 'translator.model') {
            if (val !== '' && isWhitespace) {
               errors.push({ field: field.key, message: 'Cannot be empty if provided' });
            }
         } else if (field.key === 'omdb.apiKey') {
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

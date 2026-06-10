export const SECRET_MASK = '••••••••';

// Mirrors backend src/settings/secrets.js SECRET_MASK. Keep in sync: the server
// serializes a set secret to this sentinel; the GUI uses it to distinguish a
// stored secret shown as the mask from a new value the user has typed.
export function isMaskedValue(v) {
  return typeof v === 'string' && v.includes(SECRET_MASK);
}

export function getVal(obj, key) {
  if (!obj) return '';
  return key.split('.').reduce((o, k) => (o != null ? o[k] : ''), obj) ?? '';
}

export function setVal(obj, key, value) {
  const keys = key.split('.');
  const result = { ...obj };
  let cur = result;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return result;
}

export function buildPayload(draft, fields) {
  let payload = {};
  for (const field of fields) {
    const val = getVal(draft, field.key);
    if (field.type === 'secret' && (!val || val === '')) continue;
    payload = setVal(payload, field.key, val);
  }
  return payload;
}

export function isDirty(draft, settings, fields) {
  if (!draft || !settings) return false;
  // H1 (SD-6): secrets compare like any field. An untouched secret holds the
  // server mask (== settings) so it is not dirty; a typed value differs => dirty.
  return fields.some((field) =>
    String(getVal(draft, field.key)) !== String(getVal(settings, field.key))
  );
}

export function mergeSettingsIntoDraft(prevDraft, nextSettings, schema) {
  if (!nextSettings || !schema) return null;
  let nextDraft = { ...nextSettings };
  for (const section of schema) {
    for (const field of section.fields) {
      if (field.type === 'secret') {
        // H1 (SD-6): default a secret draft to the server masked sentinel so a
        // set key reads as 'set' (not blank). Preserve an unsaved typed edit (a
        // real value, not the mask) across re-merges.
        const serverMasked = getVal(nextSettings, field.key);
        const userTyped = prevDraft ? getVal(prevDraft, field.key) : '';
        const keepTyped = userTyped && userTyped !== serverMasked && !isMaskedValue(userTyped);
        nextDraft = setVal(nextDraft, field.key, keepTyped ? userTyped : serverMasked);
      }
    }
  }
  return nextDraft;
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

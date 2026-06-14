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

export function buildPayload(draft, fields, fieldMeta = {}) {
  let payload = {};
  for (const field of fields) {
    const val = getVal(draft, field.key);
    // EDGE-1: do NOT strip an empty secret. An untouched set secret carries the mask
    // sentinel (the backend keeps it); a deliberately blanked field is '' and must reach
    // the backend so pickSecret can honour an explicit clear (the *arr "remove the API
    // key" action, fully GUI-controlled). An unset secret is '' -> backend stores '' (no-op).
    // H4.3b: env-managed fields are read-only - never echo them back to the server.
    const meta = fieldMeta[field.key];
    if (meta && meta.editable === false) continue;
    // H4.3b: an empty envVar-hinted field still means "keep current value" (its explicit
    // clear is a separate follow-on, EDGE-2). No schema secret carries an envVar hint, so
    // this branch never re-strips the EDGE-1 secret clear handled above.
    if (field.envVar && (val === '' || val == null)) continue;
    // H4.3b: number inputs emit strings; the backend validator requires integers.
    if (field.type === 'number') {
      payload = setVal(payload, field.key, Number(val));
      continue;
    }
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

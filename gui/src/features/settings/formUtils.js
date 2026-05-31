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
  return fields.some((field) => {
    if (field.type === 'secret') return getVal(draft, field.key) !== '';
    return String(getVal(draft, field.key)) !== String(getVal(settings, field.key));
  });
}

export function mergeSettingsIntoDraft(prevDraft, nextSettings, schema) {
  if (!nextSettings || !schema) return null;
  let nextDraft = { ...nextSettings };
  for (const section of schema) {
    for (const field of section.fields) {
      if (field.type === 'secret') {
        const existingSecretDraft = prevDraft ? getVal(prevDraft, field.key) : '';
        nextDraft = setVal(nextDraft, field.key, existingSecretDraft || '');
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

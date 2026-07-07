'use strict';

const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');
const log             = require('./logger');
const config          = require('./config');
const { DEFAULT_ORDER } = require('./templates/layout-fragments');
const { isValidIcon, normalizeLabel } = require('./templates/layout-schema');

const TEMPLATES_FILE = path.join(config.DATA_DIR, 'templates.json');

const DEFAULTS = {
  activeMode: 'default',
  slots:      [],
};

const MAX_SLOTS = 5;

// Reserved activeMode words (P5b): canonical 'default' + retained legacy aliases. A slot
// id must not collide with these (it could shadow, or be shadowed by, a default mode).
const RESERVED_MODES = new Set(['default', 'default_ar', 'default_en']);

// --- DEC-1/10 STRUCTURED LAYOUT (Default styling) ---
// Ordered set of ORDERABLE caption elements per kind. DRY (R02/DEC-10): the order
// universe is DEFAULT_ORDER (the renderer single source). A plain string key renders
// with the element default icon/label (byte-identical to legacy); an object item
// {key,enabled?,label?,icon?} carries P5 overrides.
// B3b: status renders INLINE in the year fragment (B3a), so its array position is slaved to
// year. PINNED_AFTER re-pins status immediately after `year` on normalize (array order ==
// GUI order == notification order); a legacy sonarr layout lacking status has it inserted
// enabled (carried preference — status was always-on pre-B3; R06). radarr has no pins.
const PINNED_AFTER = { sonarr: { status: 'year' } };
const layoutKeyOf = (item) => (typeof item === 'string' ? item : (item && item.key));

function defaultLayout() {
  return { sonarr: DEFAULT_ORDER.sonarr.slice(), radarr: DEFAULT_ORDER.radarr.slice() };
}

// Sanitize one kind (load-safe, never throws): keep known ORDERABLE keys in order, drop
// duplicates, normalize labels (DEC-3; empty preserved = no-label intent), validate icons
// (DEC-4); a bare {key} collapses to the plain string. Non-array, or empty-after-sanitize
// (corrupt), falls back to the kind default (never a blank caption body).
function normalizeLayoutKind(kind, arr) {
  const allowed = DEFAULT_ORDER[kind];
  if (!Array.isArray(arr)) return allowed.slice();
  const pins = PINNED_AFTER[kind] || null;
  const pinState = {};
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = typeof item === 'string' ? item : (item && typeof item === 'object' ? item.key : null);
    if (typeof key !== 'string' || !allowed.includes(key) || seen.has(key)) continue;
    seen.add(key);
    if (pins && pins[key]) {
      pinState[key] = (item && typeof item === 'object' && item.enabled === false) ? { enabled: false } : {};
      continue;
    }
    if (typeof item === 'string') { out.push(key); continue; }
    const norm = { key };
    if (item.enabled === false) norm.enabled = false;
    if (typeof item.label === 'string') norm.label = normalizeLabel(item.label);
    if (typeof item.icon === 'string' && isValidIcon(item.icon, key)) norm.icon = item.icon;
    out.push(Object.keys(norm).length === 1 ? key : norm);
  }
  if (!out.length) return allowed.slice();
  if (pins) {
    for (const pk of Object.keys(pins)) {
      const ai = out.findIndex((it) => layoutKeyOf(it) === pins[pk]);
      if (ai < 0) continue;
      const st = pinState[pk];
      out.splice(ai + 1, 0, (st && st.enabled === false) ? { key: pk, enabled: false } : pk);
    }
  }
  return out;
}

function normalizeLayout(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  return { sonarr: normalizeLayoutKind('sonarr', src.sonarr), radarr: normalizeLayoutKind('radarr', src.radarr) };
}

// ── LOAD FROM DISK ────────────────────────────────────────────────────────────
function loadFromDisk() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
      return {
        activeMode: typeof raw.activeMode === 'string' ? raw.activeMode : DEFAULTS.activeMode,
        slots:      Array.isArray(raw.slots) ? raw.slots : [],
        layout:     normalizeLayout(raw.layout),
        migrations: (raw.migrations && typeof raw.migrations === 'object' && !Array.isArray(raw.migrations)) ? raw.migrations : {},
      };
    }
  } catch (err) {
    log.error('Templates', `Failed to read templates.json: ${err.message} — using defaults`);
  }
  return { activeMode: DEFAULTS.activeMode, slots: [], layout: defaultLayout(), migrations: {} };
}

// ── THE LIVE SINGLETON ────────────────────────────────────────────────────────
const store = loadFromDisk();

// ── GETTERS ───────────────────────────────────────────────────────────────────
function getTemplates() {
  return { activeMode: store.activeMode, slots: store.slots };
}

function getActiveMode() {
  return store.activeMode;
}

function getSlots() {
  return store.slots;
}

function getSlotById(id) {
  return store.slots.find(s => s.id === id) || null;
}

function getLayout() {
  return { sonarr: store.layout.sonarr.slice(), radarr: store.layout.radarr.slice() };
}
// ── LAYOUT ELEMENT STATE ──────────────────────────────
// "Is element <key> enabled in <kind>'s layout?" — the P4.5 plot gate reads THIS
// (not the retired config.<kind>.includePlot). Routes through module.exports.getLayout()
// so unit tests can stub the layout (same CJS-exports seam as resolveTemplate).
// FA-48 (F10): optional layoutOverride lets a caller gate against an
// UNPERSISTED layout (preview.routes.js's B4 draft-as-you-edit path: a
// normalized draft, or the composed persisted layout when no draft is
// present) instead of always reading the persisted getLayout(). Omitted/
// non-array (every pre-existing call site: sweeper.js x4, formatter.js x1)
// falls back to persisted -- additive-only, byte-identical when omitted.
function isElementEnabled(kind, key, layoutOverride) {
  const layout = Array.isArray(layoutOverride) ? layoutOverride : (module.exports.getLayout()[kind] || []);
  for (const it of layout) {
    if (typeof it === 'string') { if (it === key) return true; }
    else if (it && it.key === key) return it.enabled !== false;
  }
  return false;
}

// ── ATOMIC WRITE ──────────────────────────────────────────────────────────────
async function persist() {
  const payload = JSON.stringify({ activeMode: store.activeMode, slots: store.slots, layout: store.layout, migrations: store.migrations }, null, 2);
  await new Promise((resolve, reject) => {
    writeFileAtomic(TEMPLATES_FILE, payload, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// ── VALIDATE SLOT ─────────────────────────────────────────────────────────────
// --- P4.5b LEGACY PLOT MIGRATION (one-shot) ---
// Honors a pre-Composer operator choice: a retired config.<kind>.includePlot===false
// becomes a disabled plot layout element, exactly ONCE. Guarded by
// store.migrations.legacyPlot so it never re-derives -- a later P5 re-enable is never
// overwritten. Booleans are INJECTED by the boot caller (SoC: templates stays
// config-agnostic here; index.js sources config.<kind>.includePlot).
async function migrateLegacyPlot(legacy) {
  try {
    if (store.migrations && store.migrations.legacyPlot) return false;
    const want = (legacy && typeof legacy === 'object') ? legacy : {};
    let changed = false;
    for (const kind of ['sonarr', 'radarr']) {
      if (want[kind] !== false) continue;
      const arr = store.layout[kind];
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        const key = typeof it === 'string' ? it : (it && it.key);
        if (key !== 'plot') continue;
        const enabled = typeof it === 'string' ? true : (it.enabled !== false);
        if (enabled) {
          arr[i] = (typeof it === 'string') ? { key: 'plot', enabled: false } : Object.assign({}, it, { enabled: false });
          changed = true;
        }
      }
    }
    store.migrations = Object.assign({}, store.migrations, { legacyPlot: true });
    await persist();
    if (changed) log.audit('Templates', 'Legacy Plot Migration → Applied → disabled plot from retired includePlot=false');
    return changed;
  } catch (err) {
    log.error('Templates', `Legacy Plot Migration → Failed → ${err.message}`);
    return false;
  }
}

function validateSlot(slot) {
  const errors = [];
  if (!slot || typeof slot !== 'object')          errors.push('Slot must be an object');
  if (!slot.id   || typeof slot.id   !== 'string') errors.push('Slot id must be a non-empty string');
  if (!slot.name || typeof slot.name !== 'string') errors.push('Slot name must be a non-empty string');
  if (slot.sonarr !== undefined && typeof slot.sonarr !== 'string') errors.push('sonarr must be a string');
  if (slot.radarr !== undefined && typeof slot.radarr !== 'string') errors.push('radarr must be a string');
  return errors;
}

// ── MUTATIONS ─────────────────────────────────────────────────────────────────

// --- P5(a) LAYOUT WRITE PATH (DEC-1/10) ---
// Persistence companion to getLayout() that P4.3a deferred. Fail-fast (R06) on a
// malformed payload so a partial/garbage shape can never silently reset a kind to its
// default; the contents are then routed through normalizeLayout (drops unknown keys,
// dedups, sanitizes label/icon) so ONLY a sanitized descriptor is persisted. slots,
// activeMode and the migrations ledger are read from store by persist(), so they are
// preserved untouched across the write.
async function setLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error('layout must be an object with sonarr and radarr arrays');
  }
  if (!Array.isArray(layout.sonarr) || !Array.isArray(layout.radarr)) {
    throw new Error('layout.sonarr and layout.radarr must each be an array');
  }
  store.layout = normalizeLayout(layout);
  await persist();
  log.audit('Templates', 'Layout set \u2192 persisted \u2192 sonarr/radarr normalized (slots/activeMode/migrations preserved)');
  return getLayout();
}

async function setActiveMode(mode) {
  if (typeof mode !== 'string') throw new Error('activeMode must be a string');
  // FA-49: reject a mode that is neither a reserved default alias nor an
  // existing slot id -- previously ANY string silently "succeeded" and
  // resolveTemplate's fallthrough pinned rendering to DEFAULT_AR forever
  // with no operator-visible signal.
  if (!RESERVED_MODES.has(mode) && !store.slots.some((s) => s.id === mode)) {
    throw new Error(`Unknown activeMode: ${mode}`);
  }
  store.activeMode = mode;
  await persist();
  log.info('Templates', `Active mode set to: ${mode}`);
  return getTemplates();
}

async function addSlot(slot) {
  if (store.slots.length >= MAX_SLOTS) throw new Error(`Maximum ${MAX_SLOTS} slots allowed`);
  const errors = validateSlot(slot);
  if (errors.length) throw new Error(errors.join('; '));
  if (RESERVED_MODES.has(slot.id)) throw new Error(`Slot id is reserved: ${slot.id}`);
  if (store.slots.find(s => s.id === slot.id)) throw new Error(`Slot id already exists: ${slot.id}`);
  store.slots.push({ id: slot.id, name: slot.name, sonarr: slot.sonarr || '', radarr: slot.radarr || '' });
  await persist();
  log.info('Templates', `Slot added: ${slot.name} (${slot.id})`);
  return getTemplates();
}

async function updateSlot(id, patch) {
  const idx = store.slots.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Slot not found: ${id}`);
  // FA-50: whitelist-pick known fields only -- previously `...patch` spread
  // ANY key over the slot, and validateSlot never rejects an unlisted key, so
  // junk fields persisted into templates.json indefinitely. Presence-checked
  // ('x' in patch) so partial-update semantics are unchanged: an omitted
  // field stays untouched, byte-identical to the prior spread's behavior.
  const picked = {};
  if (patch && typeof patch === 'object') {
    if ('name' in patch) picked.name = patch.name;
    if ('sonarr' in patch) picked.sonarr = patch.sonarr;
    if ('radarr' in patch) picked.radarr = patch.radarr;
  }
  const updated = { ...store.slots[idx], ...picked, id };
  const errors  = validateSlot(updated);
  if (errors.length) throw new Error(errors.join('; '));
  store.slots[idx] = updated;
  await persist();
  log.info('Templates', `Slot updated: ${id}`);
  return getTemplates();
}

async function deleteSlot(id) {
  const idx = store.slots.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Slot not found: ${id}`);
  store.slots.splice(idx, 1);
  if (store.activeMode === id) store.activeMode = 'default';
  await persist();
  log.info('Templates', `Slot deleted: ${id}`);
  return getTemplates();
}

// ── ACTIVE TEMPLATE RESOLUTION ────────────────────────────────────────────────
// Resolves the template string to render for a given (activeMode, kind).
// Single source for the rule previously duplicated between formatter.js (Sonarr)
// and radarr-formatter.js (Radarr) — closes roadmap M1 (Phase F.1).
//
// Precedence (parity-preserving with the legacy inline blocks):
//   activeMode === 'default_en'                     → 'DEFAULT_EN'
//   activeMode === 'default_ar'                     → 'DEFAULT_AR'
//   custom mode + slot found + slot[kind] truthy    → slot[kind]
//   anything else (no slot / falsy slot[kind])      → 'DEFAULT_AR'
//
// NOTE: `kind` is validated fail-fast (R06) — defensive add not present in the
// original blocks. Cannot fire from existing callers; prevents a silent
// `slot[undefined]` → DEFAULT_AR fallback if a future caller fat-fingers it.
//
// The internal slot lookup goes through `module.exports.getSlotById` so unit
// tests can spy on it (CJS lexical binding would otherwise bypass spyOn — see
// the Phase A vi.mock note in the roadmap). Zero runtime cost; identical
// semantics to a direct call.
function resolveTemplate(activeMode, kind) {
  if (kind !== 'sonarr' && kind !== 'radarr') {
    throw new Error(`resolveTemplate: kind must be 'sonarr' or 'radarr', got: ${JSON.stringify(kind)}`);
  }
  if (activeMode === 'default_en') return 'DEFAULT_EN';
  // 'default' = canonical AR mode (P5b); 'default_ar' is the retained legacy alias. Both
  // resolve here BEFORE the slot lookup, so a slot can never shadow the canonical mode.
  if (activeMode === 'default_ar' || activeMode === 'default') return 'DEFAULT_AR';
  const slot = module.exports.getSlotById(activeMode);
  if (slot && slot[kind]) return slot[kind];
  return 'DEFAULT_AR';
}

module.exports = { getTemplates, getActiveMode, getSlots, getSlotById, getLayout, setActiveMode, addSlot, updateSlot, deleteSlot, setLayout, resolveTemplate, normalizeLayout, defaultLayout, isElementEnabled, migrateLegacyPlot };

'use strict';

const fs              = require('fs');
const path            = require('path');
const writeFileAtomic = require('write-file-atomic');
const log             = require('./logger');

const TEMPLATES_FILE = path.join(__dirname, '../data/templates.json');

const DEFAULTS = {
  activeMode: 'default_ar',
  slots:      [],
};

const MAX_SLOTS = 5;

// ── LOAD FROM DISK ────────────────────────────────────────────────────────────
function loadFromDisk() {
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
      return {
        activeMode: typeof raw.activeMode === 'string' ? raw.activeMode : DEFAULTS.activeMode,
        slots:      Array.isArray(raw.slots) ? raw.slots : [],
      };
    }
  } catch (err) {
    log.error('Templates', `Failed to read templates.json: ${err.message} — using defaults`);
  }
  return { ...DEFAULTS };
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

// ── ATOMIC WRITE ──────────────────────────────────────────────────────────────
async function persist() {
  const payload = JSON.stringify({ activeMode: store.activeMode, slots: store.slots }, null, 2);
  await new Promise((resolve, reject) => {
    writeFileAtomic(TEMPLATES_FILE, payload, (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// ── VALIDATE SLOT ─────────────────────────────────────────────────────────────
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

async function setActiveMode(mode) {
  if (typeof mode !== 'string') throw new Error('activeMode must be a string');
  store.activeMode = mode;
  await persist();
  log.info('Templates', `Active mode set to: ${mode}`);
  return getTemplates();
}

async function addSlot(slot) {
  if (store.slots.length >= MAX_SLOTS) throw new Error(`Maximum ${MAX_SLOTS} slots allowed`);
  const errors = validateSlot(slot);
  if (errors.length) throw new Error(errors.join('; '));
  if (store.slots.find(s => s.id === slot.id)) throw new Error(`Slot id already exists: ${slot.id}`);
  store.slots.push({ id: slot.id, name: slot.name, sonarr: slot.sonarr || '', radarr: slot.radarr || '' });
  await persist();
  log.info('Templates', `Slot added: ${slot.name} (${slot.id})`);
  return getTemplates();
}

async function updateSlot(id, patch) {
  const idx = store.slots.findIndex(s => s.id === id);
  if (idx === -1) throw new Error(`Slot not found: ${id}`);
  const updated = { ...store.slots[idx], ...patch, id };
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
  if (store.activeMode === id) store.activeMode = 'default_ar';
  await persist();
  log.info('Templates', `Slot deleted: ${id}`);
  return getTemplates();
}

module.exports = { getTemplates, getActiveMode, getSlots, getSlotById, setActiveMode, addSlot, updateSlot, deleteSlot };

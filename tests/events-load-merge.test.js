import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import os from 'os';
import fs from 'fs';
const require = createRequire(import.meta.url);

// FA-5: events.js resolves EVENTS_FILE from process.env.DATA_DIR at require
// time (FU-7 env-direct exception, RD-11-class -- Master §7). Sandbox
// DATA_DIR BEFORE any require, mirroring the established portability-paths
// idiom, so this suite can never touch the live app's real
// data/events-ring.json (LIVE SAFETY).
const tmp = path.join(os.tmpdir(), `telgrarr-events-load-${process.pid}-${Date.now()}`);
fs.mkdirSync(tmp, { recursive: true });
process.env.DATA_DIR = tmp;
const EVENTS_FILE = path.join(tmp, 'events-ring.json');
const EVENTS_PATH = require.resolve('../src/events.js');

function freshEvents() {
  delete require.cache[EVENTS_PATH];
  return require('../src/events.js');
}
function seedFile(content) { fs.writeFileSync(EVENTS_FILE, content, 'utf8'); }
function clearFile() { try { fs.unlinkSync(EVENTS_FILE); } catch (_) {} }

afterAll(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

describe('loadEvents merge/order/cap/seq (FA-5)', () => {
  it('merges persisted (older) events BEFORE already-emitted (newer) boot events, in chronological order', () => {
    clearFile();
    seedFile(JSON.stringify([
      { id: '1000-1', type: 'A', level: 'info', module: 'M', message: 'old1', data: {}, timestamp: 't' },
      { id: '1000-2', type: 'A', level: 'info', module: 'M', message: 'old2', data: {}, timestamp: 't' },
    ]));
    const events = freshEvents();
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot1', {});
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot2', {});
    events.loadEvents();
    const all = events.getRecentEvents(10);
    expect(all.map(e => e.message)).toEqual(['old1', 'old2', 'boot1', 'boot2']);
  });

  it('trims to the last 50 entries after merge, keeping the most recent (parity with flushEvents\' cap)', () => {
    clearFile();
    const old = [];
    for (let i = 1; i <= 55; i++) {
      old.push({ id: `1000-${i}`, type: 'A', level: 'info', module: 'M', message: `old${i}`, data: {}, timestamp: 't' });
    }
    seedFile(JSON.stringify(old));
    const events = freshEvents();
    events.loadEvents();
    const all = events.getRecentEvents(100);
    expect(all.length).toBe(50);
    expect(all[0].message).toBe('old6');
    expect(all[49].message).toBe('old55');
  });

  it('rebases the seq counter to the true max across loaded + boot events (never reuses/regresses a seq)', () => {
    clearFile();
    seedFile(JSON.stringify([
      { id: '1000-500', type: 'A', level: 'info', module: 'M', message: 'old-high-seq', data: {}, timestamp: 't' },
    ]));
    const events = freshEvents();
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot1', {});
    events.loadEvents();
    const after = events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'post-load', {});
    const seq = Number(after.id.split('-')[1]);
    expect(seq).toBe(501);
  });

  it('tolerates a malformed id in a loaded entry without throwing or corrupting the merge', () => {
    clearFile();
    seedFile(JSON.stringify([
      { id: 'not-a-valid-id', type: 'A', level: 'info', module: 'M', message: 'malformed', data: {}, timestamp: 't' },
      { id: '2000-3', type: 'A', level: 'info', module: 'M', message: 'valid', data: {}, timestamp: 't' },
    ]));
    const events = freshEvents();
    expect(() => events.loadEvents()).not.toThrow();
    const messages = events.getRecentEvents(10).map(e => e.message);
    expect(messages).toContain('malformed');
    expect(messages).toContain('valid');
  });

  it('parity: no-ops when EVENTS_FILE does not exist', () => {
    clearFile();
    const events = freshEvents();
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot-only', {});
    events.loadEvents();
    expect(events.getRecentEvents(10).map(e => e.message)).toEqual(['boot-only']);
  });

  it('parity: no-ops on an empty persisted array', () => {
    clearFile();
    seedFile('[]');
    const events = freshEvents();
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot-only', {});
    events.loadEvents();
    expect(events.getRecentEvents(10).map(e => e.message)).toEqual(['boot-only']);
  });

  it('parity: swallows a JSON parse failure and leaves recentEvents untouched', () => {
    clearFile();
    seedFile('{not valid json');
    const events = freshEvents();
    events.emit('QUEUE_ITEM_ADDED', 'info', 'App', 'boot-only', {});
    expect(() => events.loadEvents()).not.toThrow();
    expect(events.getRecentEvents(10).map(e => e.message)).toEqual(['boot-only']);
  });
});

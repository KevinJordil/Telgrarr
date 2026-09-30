import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-poller-'));
process.env.DATA_DIR = tmp; process.env.LOGS_DIR = tmp;
const config = require('../src/config');
const store = require('../src/notifications/store');
const axios = require('axios');
const { poll } = require('../src/notifications/seerr-poller');
let get;
beforeEach(() => {
  const file = path.join(tmp, 'notifications.json'); if (fs.existsSync(file)) fs.unlinkSync(file);
  config.notifications.enabled = true; config.notifications.requestSource = 'poll';
  config.seerr = { baseUrl: 'http://seerr.test', apiKey: 'test-key' };
  get = vi.spyOn(axios, 'get');
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const request = id => ({ id, status: 2, media: { mediaType: 'movie', tmdbId: 42 }, requestedBy: { displayName: 'Camille' } });
describe('Seerr request polling', () => {
  it('establishes a baseline without announcing historical requests', async () => {
    get.mockResolvedValue({ data: { results: [request(12)] } });
    await poll(); expect(store.requestCursor()).toBe(12); expect(store.status().pending).toBe(0);
  });
  it('paginates a burst and advances the cursor only after durable enqueue', async () => {
    await store.setRequestCursor(12);
    get.mockImplementation(async (url, options) => {
      if (url.endsWith('/request')) return { data: { results: options.params.skip === 0 ? Array.from({ length: 50 }, (_, i) => request(63 - i)) : [request(13), request(12)] } };
      return { data: { title: 'Un film', releaseDate: '2026-01-01', overview: 'Résumé' } };
    });
    await poll(); expect(store.requestCursor()).toBe(63); expect(store.status().pending).toBe(51);
    expect(store.nextJob().event.requester).toBe('Camille');
    expect(get.mock.calls.filter(([url]) => url.endsWith('/request'))).toHaveLength(2);
  });
  it('preserves the cursor on metadata failure, so the request can be retried', async () => {
    await store.setRequestCursor(12);
    get.mockImplementation(async url => { if (url.endsWith('/request')) return { data: { results: [request(13)] } }; throw new Error('offline'); });
    await expect(poll()).rejects.toThrow(); expect(store.requestCursor()).toBe(12);
  });
});

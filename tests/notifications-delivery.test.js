import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'telgrarr-notifications-'));
process.env.DATA_DIR = tmp;
process.env.LOGS_DIR = tmp;
const config = require('../src/config');
const store = require('../src/notifications/store');
const telegram = require('../src/telegram');
const worker = require('../src/notifications/worker');
const { normalizeSeerr } = require('../src/notifications/model');
const { hooks, api } = require('../src/routes/notifications.routes');
const request = require('supertest');
const express = require('express');
const app = express(); app.use(express.json()); app.use('/hooks', hooks); app.use('/api', api);
const file = path.join(tmp, 'notifications.json');
const event = { event: 'request', requestId: '12', mediaType: 'movie', title: 'Un film', requester: 'Camille' };
beforeEach(() => {
  vi.restoreAllMocks();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  config.notifications.enabled = true;
  config.notifications.format = 'classic';
  config.notifications.requestSource = 'webhook';
  config.queue.maxItems = 100;
  config.tmdb.apiKey = '';
});
afterAll(async () => { await worker.stop(); fs.rmSync(tmp, { recursive: true, force: true }); });
describe('Durable notification delivery', () => {
  it('requires a session for administration and previews without sending or persisting', async () => {
    expect((await request(app).get('/api/notifications/status')).status).toBe(401);
    expect((await request(app).post('/api/notifications/retry')).status).toBe(401);
    const { activeSessions } = require('../src/middlewares/auth');
    const { COOKIE_NAME } = require('../src/auth/session-cookie');
    activeSessions.set('test-session', Date.now() + 30 * 86400000);
    const send = vi.spyOn(telegram, 'sendMessage').mockResolvedValue({ message_id: 1 });
    const response = await request(app).post('/api/notifications/preview')
      .set('Cookie', `${COOKIE_NAME}=test-session`).send({ event });
    expect(response.status).toBe(200);
    expect(response.body.caption).toContain('<b>Source :</b>\nCamille');
    expect(send).not.toHaveBeenCalled();
    expect(fs.existsSync(file)).toBe(false);
    activeSessions.delete('test-session');
  });
  it('serializes a webhook burst, persists one copy and remembers delivery after reload', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => store.enqueue(event)));
    expect(results.filter(r => r.accepted)).toHaveLength(1);
    expect(store.status().pending).toBe(1);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    await store.delivered('request:12');
    delete require.cache[require.resolve('../src/notifications/store')];
    const reloaded = require('../src/notifications/store');
    expect(await reloaded.enqueue(event)).toEqual({ accepted: false, duplicate: true });
    expect(reloaded.status().sent).toBe(1);
  });
  it('does not discard pending events when capacity is reached', async () => {
    config.queue.maxItems = 1;
    await store.enqueue(event);
    await expect(store.enqueue({ ...event, requestId: '13' })).rejects.toThrow('full');
    expect(store.status().pending).toBe(1);
  });
  it('fails closed on corrupt state without resetting the delivery ledger', async () => {
    fs.writeFileSync(file, 'broken');
    await expect(store.enqueue(event)).rejects.toThrow();
    expect(fs.readFileSync(file, 'utf8')).toBe('broken');
  });
  it('validates authentication and persists accepted events before acknowledgment', async () => {
    const payload = { notification_type: 'MEDIA_AUTO_APPROVED', subject: 'Un film', media: { media_type: 'movie', tmdbId: '42' }, request: { request_id: '12', requestedBy_username: 'Camille' } };
    expect((await request(app).post('/hooks/wrong/seerr').send(payload)).status).toBe(401);
    const response = await request(app).post(`/hooks/${config.WEBHOOK_SECRET}/seerr`).send(payload);
    expect(response.status).toBe(202);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).jobs[0].event).toEqual(normalizeSeerr(payload));
    expect((await request(app).post(`/hooks/${config.WEBHOOK_SECRET}/seerr`).send(payload)).body.duplicate).toBe(true);
    config.notifications.enabled = false;
    expect((await request(app).post(`/hooks/${config.WEBHOOK_SECRET}/seerr`).send(payload)).status).toBe(409);
  });
  it('keeps transient failures pending, blocks permanent failures, and permits manual retry', async () => {
    await store.enqueue(event);
    await store.failed('request:12', true);
    expect(store.status().pending).toBe(1);
    expect(store.nextJob()).toBeUndefined();
    await store.failed('request:12', false);
    expect(store.status().blocked).toBe(1);
    expect(await store.retryBlocked()).toBe(1);
    expect(store.nextJob().key).toBe('request:12');
  });
  it('records successful delivery and honors the pause before the next message', async () => {
    await store.enqueue(event);
    await store.enqueue({ ...event, requestId: '13' });
    const send = vi.spyOn(telegram, 'sendMessage').mockResolvedValue({ message_id: 1 });
    await worker.tick();
    await worker.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('Nouvelle demande de film');
    expect(store.status().sent).toBe(1);
    expect(store.status().pending).toBe(1);
  });
});

it('uses rich delivery and falls back only after an explicit unavailable-method response', async () => {
  config.notifications.format = 'rich';
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000);
  await store.enqueue({ ...event, requestId: '80' });
  const rich = vi.spyOn(telegram, 'sendRichMessage').mockRejectedValue(Object.assign(new Error('unsupported'), { unsupported: true, retryable: false }));
  const classic = vi.spyOn(telegram, 'sendNotification').mockResolvedValue({});
  await worker.tick();
  expect(rich).toHaveBeenCalledTimes(1);
  expect(classic).toHaveBeenCalledTimes(1);
  expect(store.status().sent).toBe(1);
});
it('leaves rich failures pending without issuing a second classic message', async () => {
  config.notifications.format = 'rich';
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120000);
  await store.enqueue({ ...event, requestId: '81' });
  vi.spyOn(telegram, 'sendRichMessage').mockRejectedValue(Object.assign(new Error('timeout'), { retryable: true }));
  const classic = vi.spyOn(telegram, 'sendNotification').mockResolvedValue({});
  await worker.tick();
  expect(classic).not.toHaveBeenCalled();
  expect(store.status().pending).toBe(1);
  expect(store.status().sent).toBe(0);
});

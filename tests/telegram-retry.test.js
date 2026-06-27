import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const config = require('../src/config.js');
config.telegram = { botToken: 'TEST_TOKEN', chatId: 'TEST_CHAT', delayMs: 0 };

const axios = require('axios');
const { sendPhoto, sleep } = require('../src/telegram.js');

const SEND_URL = 'https://api.telegram.org/botTEST_TOKEN/sendPhoto';
const PHOTO = 'https://example.test/img.jpg';
const CAPTION = 'hello';
const EXPECTED_BODY = { chat_id: 'TEST_CHAT', photo: PHOTO, caption: CAPTION, parse_mode: 'HTML' };
const EXPECTED_OPTS = { timeout: 30000 };

function apiError(status, data = {}) {
  const e = new Error(`HTTP ${status}`);
  e.response = { status, data };
  return e;
}
function netError(code) {
  const e = new Error(`network ${code}`);
  e.code = code;
  return e;
}

let postSpy;
beforeEach(() => { postSpy = vi.spyOn(axios, 'post'); });
afterEach(() => { if (postSpy) postSpy.mockRestore(); vi.useRealTimers(); });

describe('telegram.sendPhoto — retry + timeout + signal (STEP 1.2 / WR-15)', () => {
  it('preserves the sleep export', () => {
    expect(typeof sleep).toBe('function');
  });

  it('success: one axios call with timeout; returns {rateLimited:false}', async () => {
    postSpy.mockResolvedValue({ data: { ok: true } });
    const out = await sendPhoto(PHOTO, CAPTION);
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(SEND_URL, EXPECTED_BODY, EXPECTED_OPTS);
    expect(out).toEqual({ rateLimited: false });
  });

  it('429 with retry_after: retries then succeeds; returns {rateLimited:true, retryAfterMs}', async () => {
    vi.useFakeTimers();
    postSpy
      .mockRejectedValueOnce(apiError(429, { parameters: { retry_after: 2 } }))
      .mockResolvedValue({ data: { ok: true } });
    const p = sendPhoto(PHOTO, CAPTION);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ rateLimited: true, retryAfterMs: 2000 });
  });

  it('transient 5xx: retries then succeeds (rateLimited:false)', async () => {
    vi.useFakeTimers();
    postSpy.mockRejectedValueOnce(apiError(503)).mockResolvedValue({ data: { ok: true } });
    const p = sendPhoto(PHOTO, CAPTION);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ rateLimited: false });
  });

  it('network ECONNRESET: retries then succeeds', async () => {
    vi.useFakeTimers();
    postSpy.mockRejectedValueOnce(netError('ECONNRESET')).mockResolvedValue({ data: { ok: true } });
    const p = sendPhoto(PHOTO, CAPTION);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ rateLimited: false });
  });

  it('400 bad request: NO retry; byte-identical error message', async () => {
    postSpy.mockRejectedValue(apiError(400, { description: 'Bad Request: chat not found' }));
    await expect(sendPhoto(PHOTO, CAPTION))
      .rejects.toThrow('Telegram API Error: Bad Request: chat not found');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('403 forbidden: NO retry; byte-identical error message', async () => {
    postSpy.mockRejectedValue(apiError(403, { description: 'Forbidden: bot was blocked by the user' }));
    await expect(sendPhoto(PHOTO, CAPTION))
      .rejects.toThrow('Telegram API Error: Forbidden: bot was blocked by the user');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('404: NO retry', async () => {
    postSpy.mockRejectedValue(apiError(404, { description: 'Not Found' }));
    await expect(sendPhoto(PHOTO, CAPTION)).rejects.toThrow('Telegram API Error: Not Found');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('persistent 429: exhausts retries; throws with augmented metadata', async () => {
    vi.useFakeTimers();
    postSpy.mockRejectedValue(apiError(429, {
      description: 'Too Many Requests',
      parameters: { retry_after: 1 },
    }));
    const p = sendPhoto(PHOTO, CAPTION).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Telegram API Error: Too Many Requests');
    expect(err.rateLimited).toBe(true);
    expect(err.retryAfterMs).toBe(1000);
    expect(err.httpStatus).toBe(429);
    expect(postSpy).toHaveBeenCalledTimes(4);
  });

  it('persistent network error without response: throws err.message; exhausts retries', async () => {
    vi.useFakeTimers();
    postSpy.mockRejectedValue(netError('ECONNRESET'));
    const p = sendPhoto(PHOTO, CAPTION).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await p;
    expect(err.message).toBe('network ECONNRESET');
    expect(err.rateLimited).toBe(false);
    expect(err.code).toBe('ECONNRESET');
    expect(postSpy).toHaveBeenCalledTimes(4);
  });
});

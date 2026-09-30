import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axios = require('axios');
const config = require('../src/config');
const { sendMessage } = require('../src/telegram');
afterEach(() => vi.restoreAllMocks());
describe('Telegram text notification transport', () => {
  it('sends HTML with a bounded timeout and no link preview', async () => {
    config.telegram = { botToken: 'test-token', chatId: 'test-chat' };
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } });
    expect(await sendMessage('<b>Un film</b>')).toEqual({ message_id: 1 });
    expect(post).toHaveBeenCalledWith('https://api.telegram.org/bottest-token/sendMessage', {
      chat_id: 'test-chat', text: '<b>Un film</b>', parse_mode: 'HTML', disable_web_page_preview: true,
    }, { timeout: 30000 });
  });
  it('does not expose transport credentials in a permanent error', async () => {
    const cause = new Error('https://api.telegram.org/botsecret/sendMessage');
    cause.response = { status: 400, data: { description: 'secret' } };
    const post = vi.spyOn(axios, 'post').mockRejectedValue(cause);
    const error = await sendMessage('Un film').catch(e => e);
    expect(error.message).toBe('Telegram delivery failed');
    expect(error.retryable).toBe(false);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('Poster notification transport', () => {
  const telegram = require('../src/telegram');
  it('falls back to text only when Telegram explicitly rejects the image', async () => {
    const error = Object.assign(new Error('failed to get HTTP URL content'), { httpStatus: 400, retryable: false });
    vi.spyOn(telegram, 'sendPhoto').mockRejectedValue(error);
    const text = vi.spyOn(telegram, 'sendMessage').mockResolvedValue({ message_id: 1 });
    await telegram.sendNotification('Caption', 'https://image.tmdb.org/poster.jpg');
    expect(text).toHaveBeenCalledTimes(1);
  });
  it('does not risk sending a second message after an ambiguous transport failure', async () => {
    vi.spyOn(telegram, 'sendPhoto').mockRejectedValue(Object.assign(new Error('private token'), { retryable: true }));
    const text = vi.spyOn(telegram, 'sendMessage').mockResolvedValue({});
    await expect(telegram.sendNotification('Caption', 'https://image.tmdb.org/poster.jpg')).rejects.toThrow('Telegram delivery failed');
    expect(text).not.toHaveBeenCalled();
  });
});

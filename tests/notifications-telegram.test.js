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

describe('Rich message transport', () => {
  const telegram = require('../src/telegram');
  it('sends HTML using the rich_message field, with the existing timeout', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true, result: { message_id: 1, rich_message: {} } } });
    await telegram.sendRichMessage('<h2>Un film</h2><hr/>');
    expect(post.mock.calls[0][0]).toContain('/sendRichMessage');
    expect(post.mock.calls[0][1].rich_message.html).toBe('<h2>Un film</h2><hr/>');
    expect(post.mock.calls[0][2].timeout).toBe(30000);
  });
  it.each([400, 403, 404])('sanitizes a %i failure and identifies only unavailable methods for fallback', async status => {
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status, data: { description: 'private token and URL' } } });
    const error = await telegram.sendRichMessage('html').catch(e => e);
    expect(error.message).toBe('Telegram rich delivery failed');
    expect(error.retryable).toBe(false);
    expect(error.unsupported).toBe(status === 404);
  });
});

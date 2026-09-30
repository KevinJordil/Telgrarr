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

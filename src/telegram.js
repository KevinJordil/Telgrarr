'use strict';
const axios  = require('axios');
const config = require('./config');
const { retryWithBackoff } = require('./utils/retry');

// Per-request timeout for sendPhoto multipart uploads. Bounds the worst-case
// "hung socket" failure mode (prior to this constant's introduction there was no timeout — a dead connection
// stalls the dispatch loop indefinitely). 30s comfortably covers slow uplinks.
// Roadmap STEP 1.2 / O-3 (declared parity change).
const SEND_TIMEOUT_MS = 30000;

// Retryable network/transient HTTP errors. 4xx (400/403/404) are permanent and
// never retried. Honors retry_after literally on 429 (Roadmap WR-15 / C-GUARD).
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENETUNREACH', 'EAI_AGAIN',
]);

function isRetryable(err) {
  const status = err && err.response && err.response.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  if (err && err.code && RETRYABLE_NETWORK_CODES.has(err.code)) return true;
  return false;
}

function getRetryAfterMs(err) {
  const ra = err && err.response && err.response.data
    && err.response.data.parameters && err.response.data.parameters.retry_after;
  if (typeof ra === 'number' && Number.isFinite(ra) && ra > 0) return ra * 1000;
  return undefined;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPhoto(photoUrl, caption) {
  const TOKEN   = config.telegram.botToken;
  const CHAT_ID = config.telegram.chatId;
  const API_URL = `https://api.telegram.org/bot${TOKEN}`;
  let rateLimited = false;
  let lastRetryAfterMs;

  try {
    await retryWithBackoff(async () => {
      try {
        return await axios.post(`${API_URL}/sendPhoto`, {
          chat_id:    CHAT_ID,
          photo:      photoUrl,
          caption:    caption,
          parse_mode: 'HTML',
        }, { timeout: SEND_TIMEOUT_MS });
      } catch (err) {
        if (err && err.response && err.response.status === 429) {
          rateLimited = true;
          const ra = getRetryAfterMs(err);
          if (ra !== undefined) lastRetryAfterMs = ra;
        }
        throw err;
      }
    }, {
      shouldRetry: isRetryable,
      getRetryAfterMs,
      maxAttempts: 4,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      jitter: true,
    });
  } catch (err) {
    // Unmask the true Telegram API error description (byte-identical format).
    const telegramError = err.response && err.response.data && err.response.data.description
      ? `Telegram API Error: ${err.response.data.description}`
      : err.message;
    const out = new Error(telegramError);
    // Additive metadata for the dispatch layer (WR-15 / STEP 1.4 consumer).
    out.rateLimited = rateLimited;
    if (lastRetryAfterMs !== undefined) out.retryAfterMs = lastRetryAfterMs;
    if (err && err.code) out.code = err.code;
    if (err && err.response && err.response.status) out.httpStatus = err.response.status;
    out.retryable = isRetryable(err);
    throw out;
  }

  return lastRetryAfterMs !== undefined
    ? { rateLimited, retryAfterMs: lastRetryAfterMs }
    : { rateLimited };
}

module.exports = { sendPhoto, sleep };

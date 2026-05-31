'use strict';
const axios  = require('axios');
const config = require('./config');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPhoto(photoUrl, caption) {
  const TOKEN   = config.telegram.botToken;
  const CHAT_ID = config.telegram.chatId;
  const API_URL = `https://api.telegram.org/bot${TOKEN}`;

  try {
    await axios.post(`${API_URL}/sendPhoto`, {
      chat_id:    CHAT_ID,
      photo:      photoUrl,
      caption:    caption,
      parse_mode: 'HTML',
    });
  } catch (err) {
    // Unmask the true Telegram API error description
    const telegramError = err.response && err.response.data && err.response.data.description
      ? `Telegram API Error: ${err.response.data.description}`
      : err.message;
    throw new Error(telegramError);
  }
}

async function sendAll(messages) {
  const DELAY = config.telegram.delayMs;
  for (let i = 0; i < messages.length; i++) {
    const { photoUrl, caption } = messages[i];
    await sendPhoto(photoUrl, caption);
    if (i < messages.length - 1) {
      await sleep(DELAY);
    }
  }
}

module.exports = { sendPhoto, sendAll, sleep };

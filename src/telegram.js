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

module.exports = { sendPhoto, sleep };

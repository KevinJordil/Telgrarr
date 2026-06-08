'use strict';
const { sendPhoto, sleep } = require('../telegram');
const config = require('../config');

async function dispatchBatch(messages, historyItems) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { successful: [], failed: [] };
  }

  const successful = [];
  const failed = [];
  const DELAY = config.telegram.delayMs;

  for (let i = 0; i < messages.length; i++) {
    try {
      await sendPhoto(messages[i].photoUrl, messages[i].caption);
      successful.push(historyItems[i]);
    } catch (err) {
      failed.push({
        item: historyItems[i],
        error: err.message
      });
    }
    
    // Apply rate-limiting sleep between dispatches (skip after the last item)
    if (i < messages.length - 1) {
      await sleep(DELAY);
    }
  }

  return { successful, failed };
}

module.exports = { dispatchBatch };

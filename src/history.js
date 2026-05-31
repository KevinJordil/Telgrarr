const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const log = require('./logger');

const historyFile = path.join(__dirname, '../data/history.json');
const MAX_HISTORY = 100;

// 1. In-Memory Cache (Database speed)
let memoryHistory = [];

// 2. Initialize cache on boot
try {
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify([]));
  } else {
    memoryHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  }
} catch (err) {
  log.error('History', `Failed to initialize history file: ${err.message}`);
}

// 3. The Async Flush Function
async function addHistory(newItems) {
  if (!newItems || newItems.length === 0) return;

  // Unshift new items to the top, pop the oldest off the bottom (MAX 100)
  memoryHistory = [...newItems, ...memoryHistory].slice(0, MAX_HISTORY);

  // Async flush to disk using your enterprise lockfile
  try {
    const release = await lockfile.lock(historyFile, { retries: 5 });
    try {
      fs.writeFileSync(historyFile, JSON.stringify(memoryHistory, null, 2));
      log.info('History', `Flushed ${newItems.length} new item(s) to history log.`);
    } finally {
      await release();
    }
  } catch (err) {
    log.error('History', `Failed to write history to disk: ${err.message}`);
  }
}

// 4. Instant Retrieval for the React GUI
function getHistory() {
  return memoryHistory;
}

module.exports = { addHistory, getHistory };

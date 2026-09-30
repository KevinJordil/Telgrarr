'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { pipeline } = require('stream/promises');
const axios = require('axios');
const config = require('../config');
const FILE = path.join(config.DATA_DIR, 'imdb-ratings.tsv.gz');
const DAY = 86400000;
let downloading;
let retryAt = 0;
let scores = new Map();
let cacheVersion = 0;
function validId(value) { return /^tt\d+$/.test(String(value || '')) ? String(value) : ''; }
async function ensureDataset() {
  const mtime = fs.existsSync(FILE) ? fs.statSync(FILE).mtimeMs : 0;
  if (mtime && Date.now() - mtime < DAY) return;
  if (downloading) return downloading;
  if (Date.now() < retryAt) {
    if (mtime) return;
    throw new Error('IMDb ratings temporarily unavailable');
  }
  downloading = (async () => {
    const tmp = `${FILE}.tmp`;
    try {
      fs.mkdirSync(config.DATA_DIR, { recursive: true });
      // IMDb publishes this daily dataset for personal, non-commercial use.
      // No credentials or scraping of title pages is involved.
      const response = await axios.get('https://datasets.imdbws.com/title.ratings.tsv.gz', {
        responseType: 'arraybuffer', timeout: 30000, maxContentLength: 50 * 1024 * 1024,
      });
      // Validate the archive before replacing the last usable cache.
      await pipeline(require('stream').Readable.from([response.data]), zlib.createGunzip(),
        new (require('stream').Writable)({ write(chunk, encoding, done) { done(); } }));
      await fs.promises.writeFile(tmp, response.data, { mode: 0o600 });
      await fs.promises.rename(tmp, FILE);
      scores = new Map();
    } catch {
      retryAt = Date.now() + 3600000;
      await fs.promises.unlink(tmp).catch(() => {});
      if (!mtime) throw new Error('IMDb ratings temporarily unavailable');
    }
  })().finally(() => { downloading = null; });
  return downloading;
}
async function lookup(imdbId) {
  if (!validId(imdbId)) return null;
  await ensureDataset();
  const version = fs.statSync(FILE).mtimeMs;
  if (cacheVersion !== version) { scores.clear(); cacheVersion = version; }
  if (scores.has(imdbId)) return scores.get(imdbId);
  const input = fs.createReadStream(FILE);
  const unzip = zlib.createGunzip();
  input.on('error', error => unzip.destroy(error));
  input.pipe(unzip);
  const lines = readline.createInterface({ input: unzip, crlfDelay: Infinity });
  let result = null;
  try {
    for await (const line of lines) {
      const [id, rating, votes] = line.split('\t');
      if (id !== imdbId) continue;
      const value = Number(rating);
      if (Number.isFinite(value) && value > 0 && value <= 10 && Number(votes) > 0) result = value;
      break;
    }
  } finally { lines.close(); input.destroy(); unzip.destroy(); }
  scores.set(imdbId, result);
  return result;
}
module.exports = { lookup, validId };

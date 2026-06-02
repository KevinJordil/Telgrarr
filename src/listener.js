'use strict';
const express       = require('express');
const path          = require('path');
const config        = require('./config');
const log           = require('./logger');
const requestLogger = require('./middlewares/request-logger');

const app = express();

// RD-3: map config.TRUST_PROXY (raw string) to Express 'trust proxy' setting types.
// ''/'false'/'0' => false (OFF — parity with Express default); 'true'/'1' => true;
// integer => hop count; any other string => passthrough (IP/CIDR/list).
function normalizeTrustProxy(raw) {
  const v = String(raw ?? '').trim();
  if (v === '' || v === 'false' || v === '0') return false;
  if (v === 'true' || v === '1') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
app.set('trust proxy', normalizeTrustProxy(config.TRUST_PROXY));

app.use(express.json());

// -- CORS ---------------------------------------------------------------------
app.use((req, res, next) => {
  // CORS_ORIGIN (B.1) drives the allowed origin. Empty (default) => no ACAO =>
  // same-origin enforced by the browser; cross-origin denied. Set CORS_ORIGIN to
  // allow one specific origin. No hardcoded domain in shipped code (D2/D6).
  if (config.CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', config.CORS_ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// -- API Cache Policy ---------------------------------------------------------
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// -- Request Logger -----------------------------------------------------------
app.use(requestLogger);

// -- Routes -------------------------------------------------------------------
app.use('/api', require('./routes/auth.routes'));
app.use('/api', require('./routes/settings.routes'));
app.use('/api', require('./routes/queue.routes'));
app.use('/api', require('./routes/logs.routes'));
app.use('/api', require('./routes/stream.routes'));
app.use('/api', require('./routes/blacklist.routes'));
app.use('/api', require('./routes/templates.routes'));
app.use('/api', require('./routes/backups.routes'));
app.use('/api', require('./routes/about.routes'));
app.use('/api/preview', require('./routes/preview.routes'));
app.use('/hooks', require('./routes/webhooks.routes'));

// -- Health -------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// -- Static GUI (Production) --------------------------------------------------
const distPath = path.join(__dirname, '../gui/dist');
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    } else if (/\/assets\//.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// -- SPA Fallback (must be last) ----------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// -- Start --------------------------------------------------------------------
function startListener() {
  app.listen(config.PORT, config.HOST, () => {
    log.info('Listener', 'Running on ' + config.HOST + ':' + config.PORT);
  });
}

module.exports = { startListener };

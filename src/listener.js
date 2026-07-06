'use strict';
const express       = require('express');
const fs            = require('fs');
const path          = require('path');
const config        = require('./config');
const log           = require('./logger');
const requestLogger = require('./middlewares/request-logger');
const { shouldServeAppShell } = require('./utils/spa-fallback');
// -- BLR Phase 4 (BLR SD-4): observability data sources for /health -----------
const { peekLength } = require('./queue');
const { getSweepStats } = require('./sweeper');
const providerBreaker = require('./services/provider-breaker');
const translatorCooldown = require('./translator-cooldown');

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
app.use('/api', require('./routes/system.routes'));
app.use('/api', require('./routes/history.routes'));
app.use('/api/preview', require('./routes/preview.routes'));
app.use('/hooks', require('./routes/webhooks.routes'));

// -- Health -------------------------------------------------------------------
// F.8 (O3): deep health probe — queue writability + required-credential check.
// Returns 200 when all checks pass, 503 when any check fails. Existing field
// shape ({ status, time }) preserved for backward compat; new `checks` object
// surfaces individual probe results.
async function checkQueueWritable() {
  const queueFile = config.queueFile;
  const queueDir  = path.dirname(queueFile);
  try {
    await fs.promises.access(queueDir, fs.constants.W_OK);
  } catch (err) {
    return { ok: false, reason: `queue dir (${queueDir}) not writable: ${err.message}` };
  }
  try {
    await fs.promises.access(queueFile, fs.constants.W_OK);
    return { ok: true };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { ok: true, note: 'queue file not yet created; dir writable' };
    }
    return { ok: false, reason: `queue file not writable: ${err.message}` };
  }
}

function checkConfigValid() {
  const missing = config.getMissingCredentials();
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

app.get('/health', async (req, res) => {
  const checks = {
    queue:  await checkQueueWritable(),
    config: checkConfigValid(),
  };
  const allOk = Object.values(checks).every(c => c.ok);
  // -- BLR Phase 4 (BLR SD-4 / DEC-BLR-14): ADDITIVE observability sibling. --
  // Enum/number/ISO-string values only -- no key material, URLs, retry-after,
  // or error messages (D-E). Existing {status,time,checks} envelope unchanged.
  const maxItems = config.queue.maxItems;
  const len = await peekLength(); // fail-safe by contract (DEC-BLR-2): 0 on error
  const observability = {
    queue: { len, max: maxItems, pct: maxItems > 0 ? Math.round((len / maxItems) * 100) : 0 },
    sweep: getSweepStats(),
    providers: {
      tmdb: { status: providerBreaker.getTrippedReason('tmdb') || 'ok' },
      omdb: { status: providerBreaker.getTrippedReason('omdb') || 'ok' },
    },
    translator: { tiers: {} },
  };
  for (const t of [1, 2, 3]) {
    const untilMs = translatorCooldown.getCooldownUntil('tier' + t); // FA-44: key is 'tier1'/'tier2'/'tier3' (translator.js's write-side format), not the numeric loop var
    observability.translator.tiers[t] = { coolingDown: untilMs != null, untilMs };
  }
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    time:   new Date().toISOString(),
    checks,
    observability,
  });
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
// Serve the app shell ONLY for real navigations; a stale lazy-chunk / missing
// static file gets a clean 404, never HTML (decision: utils/spa-fallback.js).
app.get('*', (req, res) => {
  if (shouldServeAppShell(req)) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }
  res.status(404).set('Cache-Control', 'no-store').type('txt').send('Not found');
});

// -- Start --------------------------------------------------------------------
function startListener() {
  const server = app.listen(config.PORT, config.HOST, () => {
    log.info('Listener', 'Running on ' + config.HOST + ':' + config.PORT);
  });
  // H0: fail-soft on bind error. A free port never emits 'error' (parity with
  // today). EADDRINUSE => one actionable line + clean non-zero exit (no raw stack
  // dump). Any other bind error is surfaced, never swallowed (Rule 10).
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      log.error('Listener', 'Bind → port ' + config.PORT + ' in use → set PORT env var or edit Port in Settings then restart');
    } else {
      log.error('Listener', 'Bind → failed → ' + ((err && (err.code || err.message)) || String(err)));
    }
    process.exit(1);
  });
  return server;
}

module.exports = { startListener, app };

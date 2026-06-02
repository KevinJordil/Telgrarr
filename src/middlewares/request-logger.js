'use strict';
const log = require('../logger');
const { maskHooksUrl } = require('../auth/webhook-token');

const MODULE = 'HTTP';

function requestLogger(req, res, next) {
  if (req.method === 'OPTIONS' || req.path === '/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status   = res.statusCode;
    const msg      = `${req.method} ${maskHooksUrl(req.originalUrl)} ${status} - ${duration}ms`;

    if (status >= 500)      log.error(MODULE, msg);
    else if (status >= 400) log.warn(MODULE,  msg);
    else                    log.info(MODULE,  msg);
  });

  next();
}

module.exports = requestLogger;

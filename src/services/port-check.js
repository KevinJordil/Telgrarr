// @ts-check
'use strict';

const net = require('net');

/**
 * H4.3a: best-effort test of whether a TCP port can be bound on a host.
 * Opens a transient server and closes it immediately on success. Used by the
 * settings save path to pre-flight a port change so the operator never restarts
 * into the H0 bind-failure exit. TOCTOU-tolerant: a true result is not a binding
 * guarantee (the port may be taken between this probe and the real restart);
 * H0 remains the definitive backstop.
 *
 * @param {number} port port to test (already validated upstream)
 * @param {string} [host] interface to bind; empty/undefined => all interfaces
 * @param {number} [timeoutMs] resolve true (permissive) if the probe stalls
 * @returns {Promise<boolean>} true = bindable or ambiguous, false = definitively in use
 */
function isPortAvailable(port, host, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      tester.removeAllListeners();
      try { tester.close(); } catch { /* not listening */ }
      resolve(result);
    };

    const timer = setTimeout(() => done(true), timeoutMs);

    tester.once('error', () => done(false));
    tester.once('listening', () => done(true));

    // Mirror the real listener (app.listen(PORT, HOST)): a concrete host binds that
    // interface; empty/whitespace binds all interfaces (Node default).
    const bindHost = (typeof host === 'string' && host.trim() !== '') ? host : undefined;
    try {
      if (bindHost === undefined) tester.listen(port);
      else tester.listen(port, bindHost);
    } catch {
      done(false);
    }
  });
}

module.exports = { isPortAvailable };

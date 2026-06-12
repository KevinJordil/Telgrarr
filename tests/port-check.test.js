import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import net from 'net';

const require = createRequire(import.meta.url);
const { isPortAvailable } = require('../src/services/port-check.js');

// Bind an OS-assigned ephemeral port on loopback (listen(0)); never the app port,
// so this is collision-safe under vitest run against a live instance (ND-5).
function holdEphemeralPort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => resolve({ port: srv.address().port, srv }));
  });
}

describe('isPortAvailable (H4.3a port pre-flight)', () => {
  it('returns false for a port currently in use', async () => {
    const { port, srv } = await holdEphemeralPort();
    try {
      expect(await isPortAvailable(port, '127.0.0.1')).toBe(false);
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('returns true for a free port', async () => {
    const { port, srv } = await holdEphemeralPort();
    await new Promise((r) => srv.close(r));
    expect(await isPortAvailable(port, '127.0.0.1')).toBe(true);
  });
});

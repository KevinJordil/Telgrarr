import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);

// FA-56 / D-9 (corrected this session): PM2 does NOT reliably inject PM2_HOME
// into a managed process's own environment (verified against PM2's own
// documentation -- it is not one of PM2's documented auto-injected vars,
// unlike e.g. NODE_APP_INSTANCE). isRestartCapable()'s PM2_HOME auto-detect
// fallback is therefore NOT a reliable signal for the general "stranger on
// unknown infra" population this project ships to (Master Architecture
// Section 0 / D-A portability). The correct, portable fix is an EXPLICIT,
// DOCUMENTED default in every shipped deployment template -- restart.js
// already supports this as a first-class override (RESTART_CAPABLE=1|0).
// This suite guards both templates so a future edit can never silently
// regress back to relying on the unreliable auto-detect path alone.

describe('ecosystem.config.example.js -- RESTART_CAPABLE ships explicit (FA-56/D-9)', () => {
  it('sets RESTART_CAPABLE=1 explicitly, consistent with autorestart:true', () => {
    const config = require('../ecosystem.config.example.js');
    expect(config.apps).toHaveLength(1);
    expect(config.apps[0].autorestart).toBe(true);
    expect(config.apps[0].env.RESTART_CAPABLE).toBe('1');
  });
});

describe('.env.example -- RESTART_CAPABLE is documented (FA-56/D-9)', () => {
  it('documents RESTART_CAPABLE for non-PM2 (systemd/Docker/bare-node) deployments', () => {
    const projectRoot = path.dirname(require.resolve('../package.json'));
    const text = fs.readFileSync(path.join(projectRoot, '.env.example'), 'utf8');
    expect(text).toContain('RESTART_CAPABLE');
  });
});

import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';

// Vitest owns tests/**/*.test.js (unit/parity harnesses).
// Playwright owns tests/e2e/** via its own testDir. Keep them separate so
// `npx vitest run` never tries to load a Playwright *.spec.js file.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    // Isolate any test that requires the real config.js/logger.js (integration-
    // style suites, e.g. config-required-credentials.test.js) from the operator's
    // live DATA_DIR/LOGS_DIR. Relative to project root (cwd when vitest runs);
    // portable across bare-node/PM2/Docker/CI - no host-specific path.
    env: {
      DATA_DIR: path.join('.vitest-tmp', 'data'),
      LOGS_DIR: path.join('.vitest-tmp', 'logs'),
    },
  },
});

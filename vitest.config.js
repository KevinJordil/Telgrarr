import { defineConfig, configDefaults } from 'vitest/config';

// Vitest owns tests/**/*.test.js (unit/parity harnesses).
// Playwright owns tests/e2e/** via its own testDir. Keep them separate so
// `npx vitest run` never tries to load a Playwright *.spec.js file.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
});

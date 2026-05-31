import { test, expect } from '@playwright/test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SETTINGS_SCHEMA } = require('../../src/settings-schema.js');

const baselineSettings = {
  listenerPort: 3400,
  listenerHost: '0.0.0.0',
  batchWindowMs: 180000,
  sonarr: { baseUrl: 'http://127.0.0.1:8989', apiKey: 'son••••••••_key' },
  radarr: { baseUrl: 'http://127.0.0.1:7878', apiKey: 'rad••••••••_key' },
  telegram: { botToken: '123••••••••Exxx', chatId: '-100123456', delayMs: 3000 },
  emby: { refreshUrl: '', apiKey: '' },
  tmdb: { apiKey: '••••••••', language: 'en-US' },
  seerr: { baseUrl: '' },
  omdb: { apiKey: '' },
  translator: { endpoint: '', model: '', apiKey: '', deeplApiKey: '' },
  mediaCache: { ttlDays: 30, maxEntries: 500 },
  backup: { enabled: true, intervalDays: 7, retainCount: 5 },
  logging: {
    level: 'info',
    rotation: {
      app: { maxSizeMb: 10, maxAgeDays: 7 },
      error: { maxSizeMb: 10, maxAgeDays: 30 },
      audit: { maxSizeMb: 5, maxAgeDays: 365 }
    }
  }
};

test('Settings save flow (Hermetic Mock)', async ({ page }) => {
  let postPayload = null;

  await page.addInitScript(() => {
    localStorage.setItem('telgrarr_token', 'fake-hermetic-token');
  });

  await page.route('**/api/auth/verify', route => route.fulfill({ status: 200, json: { success: true, user: { username: 'admin' } } }));
  await page.route('**/api/health', route => route.fulfill({ status: 200, json: { status: 'ok' } }));
  await page.route('**/api/stream*', route => route.abort());

  await page.route('**/api/settings/schema', async route => {
    await route.fulfill({ status: 200, json: SETTINGS_SCHEMA });
  });

  await page.route('**/api/settings', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: baselineSettings });
    } else if (route.request().method() === 'POST') {
      postPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        json: { success: true, hotReloaded: true, needsRestart: false, settings: baselineSettings }
      });
    } else {
      await route.continue();
    }
  });

  await page.goto('/settings');

  const urlInput = page.getByDisplayValue('http://127.0.0.1:8989');
  await expect(urlInput).toBeVisible();
  await urlInput.fill('http://10.0.0.5:8989');

  await page.locator('button', { hasText: 'Save Sonarr' }).click();

  const responsePromise = page.waitForResponse(response =>
    response.url().includes('/api/settings') && response.request().method() === 'POST'
  );
  await page.locator('button', { hasText: 'Save Changes' }).click();
  await responsePromise;

  expect(postPayload).not.toBeNull();
  expect(postPayload.sonarr).toBeDefined();
  expect(postPayload.sonarr.baseUrl).toBe('http://10.0.0.5:8989');
  expect(postPayload.sonarr.apiKey).toBeUndefined();
  expect(postPayload.radarr).toBeUndefined();
  expect(postPayload.telegram).toBeUndefined();
});

import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SETTINGS_SCHEMA } = require('../../src/settings-schema');
const { REQUEST_TEMPLATE, AVAILABLE_TEMPLATE } = require('../../src/notifications/model');

test('French notification settings and offline preview', async ({ page }) => {
  const settings = { telegram: { botToken: '', chatId: '', delayMs: 6000 }, notifications: { enabled: false, summaryLength: 350, requestTemplate: REQUEST_TEMPLATE, availableTemplate: AVAILABLE_TEMPLATE }, backup: { enabled: true, intervalDays: 7, retainCount: 5 } };
  let previews = 0;
  let realTests = 0;
  await page.addInitScript(() => localStorage.setItem('telgrarr_authed', '1'));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    let json = {};
    if (pathname === '/api/auth/verify') json = { success: true, user: { username: 'admin' } };
    if (pathname === '/api/auth/setup-status') json = { configured: true };
    if (pathname === '/api/settings') json = settings;
    if (pathname === '/api/settings/schema') json = SETTINGS_SCHEMA;
    if (pathname === '/api/notifications/status') json = { pending: 2, blocked: 0, sent: 3 };
    if (pathname === '/api/notifications/preview') {
      previews++;
      json = { caption: '<b>Épisode disponible sur Plex</b>\nUne série\nS02E03 — Le retour\n\nOrigine : Demande Seerr — Camille\nQualité : WEBDL-1080p' };
    }
    if (pathname === '/api/settings/test/telegram') realTests++;
    if (pathname.includes('/stream')) return route.abort();
    return route.fulfill({ status: 200, json });
  });
  await page.goto('/settings');
  const section = page.locator('#settings-notifications-body');
  await expect(page.getByRole('button', { name: 'Notifications Plex et Seerr', exact: true })).toBeVisible();
  if (!await section.isVisible()) await page.getByRole('button', { name: 'Notifications Plex et Seerr', exact: true }).click();
  await expect(section.getByLabel('Modèle des disponibilités')).toHaveValue(AVAILABLE_TEMPLATE);
  await section.getByRole('button', { name: 'Aperçu disponibilité', exact: true }).click();
  const preview = section.getByLabel('Aperçu du message');
  await expect(preview).toContainText('Épisode disponible sur Plex');
  await expect(preview.locator('strong')).toContainText('Épisode disponible sur Plex');
  await expect(section).toContainText('En attente : 2');
  expect(previews).toBe(1);
  expect(realTests).toBe(0);
});

test('Rich notification settings and season preview display headings, divider and trailer link', async ({ page }) => {
  const { REQUEST_RICH_TEMPLATE, AVAILABLE_RICH_TEMPLATE, presentation } = require('../../src/notifications/model');
  const settings = { seerr: {}, notifications: { enabled: false, format: 'rich', trailersEnabled: true, summaryLength: 350, requestTemplate: REQUEST_TEMPLATE, availableTemplate: AVAILABLE_TEMPLATE, requestRichTemplate: REQUEST_RICH_TEMPLATE, availableRichTemplate: AVAILABLE_RICH_TEMPLATE }, backup: { enabled: true, intervalDays: 7, retainCount: 5 } };
  let previews = 0;
  await page.addInitScript(() => localStorage.setItem('telgrarr_authed', '1'));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let json = {};
    if (pathname === '/api/auth/verify') json = { success: true, user: { username: 'admin' } };
    if (pathname === '/api/auth/setup-status') json = { configured: true };
    if (pathname === '/api/settings') json = settings;
    if (pathname === '/api/settings/schema') json = SETTINGS_SCHEMA;
    if (pathname === '/api/notifications/status') json = { pending: 0, blocked: 0, sent: 0 };
    if (pathname === '/api/notifications/preview') {
      previews++;
      json = presentation(route.request().postDataJSON().event, settings);
    }
    if (pathname.includes('/stream')) return route.abort();
    return route.fulfill({ status: 200, json });
  });
  await page.goto('/settings');
  const section = page.locator('#settings-notifications-body');
  await expect(page.getByRole('button', { name: 'Notifications Plex et Seerr', exact: true })).toBeVisible();
  if (!await section.isVisible()) await page.getByRole('button', { name: 'Notifications Plex et Seerr', exact: true }).click();
  await expect(section.getByLabel('Présentation Telegram', { exact: true })).toHaveValue('rich');
  await section.getByRole('button', { name: 'Aperçu saison', exact: true }).click();
  const preview = section.getByLabel('Aperçu du message');
  await expect(preview.locator('h2')).toContainText('Une série');
  await expect(preview.locator('h4')).toContainText('Saison 2');
  await expect(preview.locator('hr')).toHaveCount(2);
  await expect(preview.getByRole('link', { name: 'Rechercher la bande-annonce VF — saison 2' })).toHaveAttribute('href', /youtube.com/);
  expect(previews).toBe(1);
});

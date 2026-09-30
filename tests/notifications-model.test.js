import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const model = require('../src/notifications/model');
const settings = {
  seerr: { baseUrl: 'https://requests.example.test' },
  notifications: { summaryLength: 350, requestTemplate: model.REQUEST_TEMPLATE, availableTemplate: model.AVAILABLE_TEMPLATE },
};
const request = { notification_type: 'MEDIA_PENDING', subject: '<Un film> & amis', media: { media_type: 'movie', tmdbId: '42' }, request: { request_id: '12', requestedBy_username: 'Camille' } };
const plex = { action: 'created', media_type: 'episode', rating_key: '56', server_machine_id: 'server', grandparent_title: 'Une série', title: 'Le retour', season_num: '2', episode_num: '3' };
describe('French notification messages', () => {
  it('escapes external titles and includes a coherent request link', () => {
    const event = model.normalizeSeerr(request);
    expect(model.render(event, settings)).toContain('&lt;Un film&gt; &amp; amis');
    expect(model.render(event, settings)).toContain('<b>Demandé par :</b>\nCamille');
    expect(model.render(event, settings)).toContain('https://requests.example.test/movie/42');
  });
  it('uses the public Seerr URL rather than Docker DNS in Telegram links', () => {
    const custom = { ...settings, seerr: { ...settings.seerr, baseUrl: 'http://jellyseerr:5055', publicUrl: 'https://requests.example.test' } };
    expect(model.render(model.normalizeSeerr(request), custom)).toContain('https://requests.example.test/movie/42');
    expect(model.render(model.normalizeSeerr(request), custom)).not.toContain('jellyseerr');
  });
  it('deduplicates pending and later approval for the same request', () => {
    const approved = model.normalizeSeerr({ ...request, notification_type: 'MEDIA_APPROVED' });
    expect(model.eventKey(approved)).toBe(model.eventKey(model.normalizeSeerr(request)));
  });
  it('rejects unidentified events and ignores application tests and Seerr availability', () => {
    expect(() => model.normalizeTautulli({ ...plex, rating_key: '' })).toThrow();
    expect(() => model.normalizeSeerr({ ...request, request: {} })).toThrow();
    expect(model.normalizeSeerr({ notification_type: 'TEST_NOTIFICATION' })).toBeNull();
    expect(model.normalizeSeerr({ notification_type: 'MEDIA_AVAILABLE' })).toBeNull();
    expect(model.normalizeTautulli({ action: 'test' })).toBeNull();
  });
  it('keeps episodes distinct and does not repeat an upgrade', () => {
    const event = model.normalizeTautulli(plex);
    expect(model.eventKey({ ...event, quality: '2160p' })).toBe(model.eventKey(event));
    expect(model.eventKey({ ...event, ratingKey: '57' })).not.toBe(model.eventKey(event));
    const caption = model.render(event, settings);
    expect(caption).toContain('Épisode disponible sur Plex');
    expect(caption).toContain('S02E03 — Le retour');
    expect(caption).toContain('<b>Une série</b>');
    expect(caption).toContain('<b>Origine :</b>\nInconnue');
    expect(caption).toContain('<b>Qualité :</b>\n<code>Non renseignée</code>');
  });
  it('marks test messages and keeps them outside the production deduplication ledger', () => {
    const event = model.normalizeTautulli({ ...plex, test: true, test_id: 'preview-1' });
    expect(model.render(event, settings)).toMatch(/^\[TEST Telgrarr\]/);
    expect(model.eventKey(event)).not.toBe(model.eventKey(model.normalizeTautulli(plex)));
  });
  it('never forwards token-bearing or unsafe URLs', () => {
    expect(model.safeUrl('https://plex.example.test/?X-Plex-Token=secret')).toBe('');
    expect(model.safeUrl('javascript:alert(1)')).toBe('');
    expect(model.safeUrl('https://user:password@plex.example.test/')).toBe('');
    const event = { ...model.normalizeTautulli(plex), plexUrl: 'https://plex.example.test/?token=secret' };
    expect(model.render(event, settings)).not.toContain('secret');
    expect(model.render(event, settings)).toContain('https://app.plex.tv/desktop/');
  });
  it('limits the synopsis and refuses unescaped template variables', () => {
    const event = { ...model.normalizeTautulli(plex), overview: 'A'.repeat(1500) };
    expect(model.viewData(event, settings).overview).toHaveLength(350);
    expect(() => model.render(event, { ...settings, notifications: { ...settings.notifications, availableTemplate: '{{{title}}}' } })).toThrow();
  });
});

it('fits photo captions including the test label and preserves the IMDb line and links', () => {
  const event = { ...model.normalizeTautulli(plex), isTest: true, imdbRating: '7,3', overview: 'Résumé très détaillé '.repeat(100), origin: 'Demande Seerr — Camille', quality: 'WEBDL-2160p · HEVC · Dolby Vision' };
  const caption = model.render(event, settings, 1024);
  expect(caption.length).toBeLessThanOrEqual(1024);
  expect(caption).toContain('<b>IMDb :</b> 7,3/10');
  expect(caption).toContain('Voir sur Plex');
  expect(model.render(model.normalizeSeerr(request), settings)).not.toContain('IMDb :');
});

it('distinguishes season batches and only labels verified complete seasons as complete', () => {
  const season = model.normalizeTautulli({ ...plex, media_type: 'season', season_num: '2', episode_num: '1-8', episode_count: '8' });
  const caption = model.render(season, settings);
  expect(caption).toContain('Épisodes disponibles sur Plex');
  expect(caption).toContain('Saison 2 — épisodes 1–8 (8 épisodes)');
  expect(model.render({ ...season, seasonComplete: true }, settings)).toContain('Saison complète disponible sur Plex');
  expect(model.eventKey({ ...season, episodeRange: '9-12' })).not.toBe(model.eventKey(season));
});

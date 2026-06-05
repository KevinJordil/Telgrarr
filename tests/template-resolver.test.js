import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const templates = require('../src/templates.js');

// Phase F.1d — freezes the contract of templates.resolveTemplate (introduced
// in F.1a). Parity with the legacy inline selection blocks (formatter.js /
// radarr-formatter.js) was the gate; this file makes that gate permanent.
//
// Custom-slot paths use vi.spyOn(templates, 'getSlotById'). This works because
// (a) createRequire returns the same object reference as module.exports inside
// templates.js, and (b) resolveTemplate looks up via module.exports.getSlotById
// (intentional design — see the comment block in src/templates.js).

describe('templates.resolveTemplate', () => {

  describe('kind validation (R06 fail-fast — defensive add not in legacy blocks)', () => {
    it('throws when kind is omitted', () => {
      expect(() => templates.resolveTemplate('default_ar')).toThrow(/kind must be/);
    });
    it('throws on an unknown kind string', () => {
      expect(() => templates.resolveTemplate('default_ar', 'plex')).toThrow(/kind must be/);
    });
    it('throws when kind is null', () => {
      expect(() => templates.resolveTemplate('default_ar', null)).toThrow(/kind must be/);
    });
  });

  describe('default modes (parity with legacy inline blocks)', () => {
    it("activeMode='default_en' + kind='sonarr' -> 'DEFAULT_EN'", () => {
      expect(templates.resolveTemplate('default_en', 'sonarr')).toBe('DEFAULT_EN');
    });
    it("activeMode='default_en' + kind='radarr' -> 'DEFAULT_EN'", () => {
      expect(templates.resolveTemplate('default_en', 'radarr')).toBe('DEFAULT_EN');
    });
    it("activeMode='default_ar' + kind='sonarr' -> 'DEFAULT_AR'", () => {
      expect(templates.resolveTemplate('default_ar', 'sonarr')).toBe('DEFAULT_AR');
    });
    it("activeMode='default_ar' + kind='radarr' -> 'DEFAULT_AR'", () => {
      expect(templates.resolveTemplate('default_ar', 'radarr')).toBe('DEFAULT_AR');
    });
  });

  describe('custom mode — slot lookup (parity with legacy inline blocks)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns slot.sonarr when slot is found and slot.sonarr is truthy', () => {
      vi.spyOn(templates, 'getSlotById').mockReturnValue({
        id: 'custom1', name: 'C1', sonarr: 'TPL_S', radarr: 'TPL_R',
      });
      expect(templates.resolveTemplate('custom1', 'sonarr')).toBe('TPL_S');
    });

    it('returns slot.radarr when slot is found and slot.radarr is truthy', () => {
      vi.spyOn(templates, 'getSlotById').mockReturnValue({
        id: 'custom1', name: 'C1', sonarr: 'TPL_S', radarr: 'TPL_R',
      });
      expect(templates.resolveTemplate('custom1', 'radarr')).toBe('TPL_R');
    });

    it("falls back to 'DEFAULT_AR' when slot exists but slot[kind] is empty string", () => {
      vi.spyOn(templates, 'getSlotById').mockReturnValue({
        id: 'custom1', name: 'C1', sonarr: '', radarr: '',
      });
      expect(templates.resolveTemplate('custom1', 'sonarr')).toBe('DEFAULT_AR');
      expect(templates.resolveTemplate('custom1', 'radarr')).toBe('DEFAULT_AR');
    });

    it("falls back to 'DEFAULT_AR' when getSlotById returns null (unknown custom mode)", () => {
      vi.spyOn(templates, 'getSlotById').mockReturnValue(null);
      expect(templates.resolveTemplate('nonexistent', 'sonarr')).toBe('DEFAULT_AR');
      expect(templates.resolveTemplate('nonexistent', 'radarr')).toBe('DEFAULT_AR');
    });
  });

});

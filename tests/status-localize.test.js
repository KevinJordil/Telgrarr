import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { localizeStatus } = require('../src/services/media-enricher.js');
const { translateStatus } = require('../src/genres.js');
const { CAPTION_STRINGS } = require('../src/templates/caption-strings.js');

const ENUM = ['continuing', 'ended', 'upcoming'];
const LTR = ['es', 'fr', 'de', 'pt'];

describe('status-localize: ar/en delegate to translateStatus (byte-for-byte)', () => {
  for (const st of ['continuing', 'ended', 'upcoming', 'Continuing', 'weird']) {
    it('"' + st + '" ar/en == translateStatus', () => {
      expect(localizeStatus(st, 'ar')).toBe(translateStatus(st));
      expect(localizeStatus(st, 'en')).toBe(translateStatus(st));
    });
  }
});

describe('status-localize: null/empty -> null', () => {
  it('null and empty', () => {
    expect(localizeStatus(null, 'es')).toBe(null);
    expect(localizeStatus('', 'es')).toBe(null);
  });
});

describe('status-localize: LTR targets map known statuses from the leaf', () => {
  for (const lang of LTR) {
    for (const k of ENUM) {
      it(lang + '/' + k, () => {
        expect(localizeStatus(k, lang)).toBe(CAPTION_STRINGS[lang].status[k]);
      });
    }
  }
  it('case-insensitive key match', () => {
    expect(localizeStatus('CONTINUING', 'de')).toBe(CAPTION_STRINGS.de.status.continuing);
  });
  it('unknown status -> title-cased raw fallback', () => {
    for (const lang of LTR) expect(localizeStatus('returning', lang)).toBe('Returning');
  });
});

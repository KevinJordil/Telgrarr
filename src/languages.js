'use strict';
// Single source of the supported translation languages (Roadmap DEC-9).
// Zero-dep leaf so BOTH translator.js and settings-schema.js can import it without
// re-forming the config -> settings-schema -> translator cycle (same pattern as
// translator-prompts.js). Owns language IDENTITY only (code + display name);
// translation attributes (deepl/google/dir/watermark) stay in translator.js LANG.
const LANGUAGES = [
  { code: 'ar', name: 'Arabic' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
];
const LANGUAGE_NAME = Object.fromEntries(LANGUAGES.map((l) => [l.code, l.name]));
module.exports = { LANGUAGES, LANGUAGE_NAME };

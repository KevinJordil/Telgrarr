'use strict';
const axios   = require('axios');
const config  = require('./config');
const log     = require('./logger');
const events  = require('./events');
const EVENT_TYPES = require('../shared/events.json');
const { buildPrompt } = require('./translator-prompts');
const { LANGUAGE_NAME } = require('./languages');
const { retryWithBackoff } = require('./utils/retry');

// Shared 429/transient retry classifier for all translator tiers. Per-tier
// timeouts (30s/10s/8s) are preserved as today. Retry sits AROUND the provider
// call; on exhaustion the existing catch fires and escalates to the next tier
// — parity with pre-change for all non-429/non-transient inputs.
// Roadmap STEP 1.3 / WR-10 / WR-12 (provider-breaker untouched) / C-GUARD.
const TRANSLATOR_RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENETUNREACH', 'EAI_AGAIN',
]);

function isTranslatorRetryable(err) {
  const status = err && err.response && err.response.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  if (err && err.code && TRANSLATOR_RETRYABLE_CODES.has(err.code)) return true;
  return false;
}

// Reads the standard HTTP Retry-After header (RFC 7231): integer seconds or
// HTTP-date. Returns ms or undefined; the retry util falls back to exponential
// backoff when undefined.
function getTranslatorRetryAfterMs(err) {
  const h = err && err.response && err.response.headers;
  if (!h) return undefined;
  const raw = h['retry-after'] || h['Retry-After'];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : undefined;
  }
  return undefined;
}

const TRANSLATOR_RETRY_OPTS = {
  shouldRetry: isTranslatorRetryable,
  getRetryAfterMs: getTranslatorRetryAfterMs,
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  jitter: true,
};

const ARABIC_RE = /[؀-ۿ]/;

const LANG = {
  ar: { name: LANGUAGE_NAME.ar,     deepl: 'AR',    google: 'ar', dir: 'rtl', watermark: 'ترجمة آلية' },
  en: { name: LANGUAGE_NAME.en,    deepl: 'EN-US', google: 'en', dir: 'ltr', watermark: 'Machine Translation' },
  es: { name: LANGUAGE_NAME.es,    deepl: 'ES',    google: 'es', dir: 'ltr', watermark: 'Traducción automática' },
  fr: { name: LANGUAGE_NAME.fr,     deepl: 'FR',    google: 'fr', dir: 'ltr', watermark: 'Traduction automatique' },
  de: { name: LANGUAGE_NAME.de,     deepl: 'DE',    google: 'de', dir: 'ltr', watermark: 'Maschinelle Übersetzung' },
  pt: { name: LANGUAGE_NAME.pt, deepl: 'PT-BR', google: 'pt', dir: 'ltr', watermark: 'Tradução automática' },
};

async function translateText(text, { targetLang = 'ar', fallback = null } = {}) {
  const lang = LANG[targetLang] || LANG.ar;
  if (!text) return fallback;
  if (targetLang === 'ar' && ARABIC_RE.test(text)) return text;

  // ── Tier 1: GitHub/Azure OpenAI-compatible LLM ──────────────────────────────
  const t1Key      = config.translator?.apiKey;
  const t1Endpoint = config.translator?.endpoint || 'https://models.inference.ai.azure.com/chat/completions';
  const t1Model    = config.translator?.model    || 'gpt-4o-mini';

  if (config.translator?.aiEnabled !== false && t1Key) {
    try {
      const res = await retryWithBackoff(async () => axios.post(
        t1Endpoint,
        {
          model: t1Model,
          messages: [
            { role: 'system', content: buildPrompt(lang.name, config.translator?.shortPlot === true) },
            { role: 'user',   content: text }
          ],
          temperature: 0.3
        },
        { headers: { 'Authorization': `Bearer ${t1Key}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      ), TRANSLATOR_RETRY_OPTS);
      const translated = res.data?.choices?.[0]?.message?.content?.trim();
      if (translated) {
        log.info('Translator', `Translation → Complete → Tier: [1 (AI)] | Length: [${text.length}]`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_SUCCESS, { tier: 1, length: text.length });
        return translated;
      }
      throw new Error('Invalid LLM response structure');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      log.warn('Translator', `Tier 1 (AI) → Failed → Escalating | ${msg}`);
      events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 1, error: msg });
    }
  }

  // ── Tier 2: DeepL Free API ───────────────────────────────────────────────────
  const t2Key = config.translator?.deeplApiKey;
  if (config.translator?.deeplEnabled !== false && t2Key) {
    try {
      const res = await retryWithBackoff(async () => axios.post(
        'https://api-free.deepl.com/v2/translate',
        new URLSearchParams({ auth_key: t2Key, text, source_lang: 'EN', target_lang: lang.deepl }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      ), TRANSLATOR_RETRY_OPTS);
      const translated = res.data?.translations?.[0]?.text;
      if (translated) {
        log.info('Translator', `Translation → Complete → Tier: [2 (DeepL)] | Length: [${text.length}]`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_SUCCESS, { tier: 2, length: text.length });
        return translated;
      }
      throw new Error('Invalid DeepL response structure');
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      log.warn('Translator', `Tier 2 (DeepL) → Failed → Escalating | ${msg}`);
      events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 2, error: msg });
    }
  } else if (config.translator?.deeplEnabled === false) {
    log.warn('Translator', 'Tier 2 (DeepL) \u2192 Skipped \u2192 disabled');
  } else {
    log.warn('Translator', 'Tier 2 (DeepL) → Skipped → deeplApiKey not configured');
  }

  // ── Tier 3: Google Translate (unofficial) ───────────────────────────────────
  if (config.translator?.googleEnabled !== false) {
    try {
      const gKey = config.translator?.googleApiKey;
      let translated;
      if (gKey) {
        const gEndpoint = config.translator?.googleEndpoint || config.DEFAULTS.translator.googleEndpoint;
        const gRes = await retryWithBackoff(async () => axios.post(
          `${gEndpoint}?key=${encodeURIComponent(gKey)}`,
          { q: text, source: 'en', target: lang.google, format: 'text' },
          { timeout: 8000 }
        ), TRANSLATOR_RETRY_OPTS);
        translated = gRes.data?.data?.translations?.[0]?.translatedText;
      } else {
        const res = await retryWithBackoff(async () => axios.get(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang.google}&dt=t&q=${encodeURIComponent(text)}`,
          { timeout: 8000 }
        ), TRANSLATOR_RETRY_OPTS);
        translated = res.data?.[0]?.[0]?.[0];
      }
      if (translated) {
        log.info('Translator', `Translation → Complete → Tier: [3 (Google)] | Length: [${text.length}]`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_SUCCESS, { tier: 3, length: text.length });
        return translated;
      }
      throw new Error('Invalid Google response structure');
    } catch (err) {
      log.warn('Translator', `Tier 3 (Google) → Failed → Escalating | ${err.message}`);
      events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 3, error: err.message });
    }
  } else {
    log.warn('Translator', 'Tier 3 (Google) \u2192 Skipped \u2192 disabled');
  }
  // ── Tier 4: Graceful degradation ────────────────────────────────────────────
  log.warn('Translator', `Translation → Skipped → All tiers exhausted | Length: [${text.length}]`);
  events.emit(EVENT_TYPES.TRANSLATOR_SKIPPED, { length: text.length });
  return fallback;
}


function aiWatermark(targetLang = 'ar') {
  const lang = LANG[targetLang] || LANG.ar;
  return '\n\n<blockquote>' + lang.watermark + '</blockquote>';
}

module.exports = { translateText, aiWatermark, LANG };

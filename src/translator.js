'use strict';
const axios   = require('axios');
const config  = require('./config');
const log     = require('./logger');
const events  = require('./events');
const EVENT_TYPES = require('../shared/events.json');
const { buildPrompt } = require('./translator-prompts');
const { LANGUAGE_NAME } = require('./languages');
const { retryWithBackoff } = require('./utils/retry');
const cooldown = require('./translator-cooldown');

// [BLR SD-1] Translator cascade retry classifier: RETRY only 5xx and network
// errors within the same tier. 429 (rate-limit) and 456 (DeepL quota) return
// false — ESCALATION is the cascade's raison d'être; a rate-limited or
// quota-exhausted provider should not be re-hit, it should be SKIPPED for the
// rest of the cascade (see translator-cooldown.js). Diverges intentionally
// from telegram.js's shouldRetry; utils/retry.js is UNCHANGED — divergence
// is per-caller here.
const TRANSLATOR_RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ENETUNREACH', 'EAI_AGAIN',
]);
function isTranslatorTransient(err) {
  const status = err && err.response && err.response.status;
  if (status === 429) return false;                     // escalate, don't retry
  if (status === 456) return false;                     // DeepL quota => escalate
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
  shouldRetry: isTranslatorTransient,
  getRetryAfterMs: getTranslatorRetryAfterMs,
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 10000,
  jitter: true,
};
// [BLR Phase 2] Per-tier quota-exhausted detectors. Return true when the
// provider signals monthly/daily quota exhaustion (distinct from rate-limit).
// The cascade escalates on quota just like on 429, but the cooldown is set
// to MAX_COOLDOWN_MS because quota refresh is monthly and waiting is
// pointless (DEC-BLR-6).
function isT1QuotaExhausted(err) {
  if (!err || !err.response) return false;
  if (err.response.status !== 429) return false;
  const body = err.response.data || {};
  const errBody = body.error || {};
  if (errBody.code === 'insufficient_quota') return true;
  if (typeof errBody.message === 'string' && /quota/i.test(errBody.message)) return true;
  return false;
}
function isT2QuotaExhausted(err) {
  return !!(err && err.response && err.response.status === 456);
}
function isT3QuotaExhausted(err) {
  if (!err || !err.response) return false;
  if (err.response.status !== 403) return false;
  const body = err.response.data || {};
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return /quotaExceeded|userRateLimitExceeded/.test(raw);
}

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
    if (cooldown.isCoolingDown('tier1')) {
      log.info('Translator', 'Tier 1 (AI) → Skipped → cooling down');
    } else {
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
        const status = err.response?.status;
        if (isT1QuotaExhausted(err))    cooldown.noteQuotaExhausted('tier1');
        else if (status === 429)         cooldown.noteRateLimit('tier1', getTranslatorRetryAfterMs(err));
        const msg = err.response?.data?.error?.message || err.message;
        log.warn('Translator', `Tier 1 (AI) → Failed → Escalating | ${msg}`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 1, error: msg });
      }
    }
  }
  // ── Tier 2: DeepL Free API ───────────────────────────────────────────────────
  const t2Key = config.translator?.deeplApiKey;
  if (config.translator?.deeplEnabled !== false && t2Key) {
    if (cooldown.isCoolingDown('tier2')) {
      log.info('Translator', 'Tier 2 (DeepL) → Skipped → cooling down');
    } else {
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
        const status = err.response?.status;
        if (isT2QuotaExhausted(err))    cooldown.noteQuotaExhausted('tier2');
        else if (status === 429)         cooldown.noteRateLimit('tier2', getTranslatorRetryAfterMs(err));
        const msg = err.response?.data?.message || err.message;
        log.warn('Translator', `Tier 2 (DeepL) → Failed → Escalating | ${msg}`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 2, error: msg });
      }
    }
  } else if (config.translator?.deeplEnabled === false) {
    log.warn('Translator', 'Tier 2 (DeepL) \u2192 Skipped \u2192 disabled');
  } else {
    log.warn('Translator', 'Tier 2 (DeepL) → Skipped → deeplApiKey not configured');
  }
  // ── Tier 3: Google Translate (unofficial) ───────────────────────────────────
  if (config.translator?.googleEnabled !== false) {
    if (cooldown.isCoolingDown('tier3')) {
      log.info('Translator', 'Tier 3 (Google) → Skipped → cooling down');
    } else {
      const gKey = config.translator?.googleApiKey;
      try {
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
        const status = err.response?.status;
        if (isT3QuotaExhausted(err))    cooldown.noteQuotaExhausted('tier3');
        else if (status === 429)         cooldown.noteRateLimit('tier3', getTranslatorRetryAfterMs(err));
        else if (!gKey && typeof status === 'number' && (status < 200 || status >= 300)) {
          // [BLR SD-2 / DEC-BLR-8] "Any non-2xx trips cooldown" hardening is
          // SCOPED to the unauthenticated gtx path only (no published rate-
          // limit contract, most ban-exposed surface). The authenticated
          // Google Cloud Translate path (gKey set) is a documented API and
          // keeps strict 429/quota-only semantics, matching Tiers 1 and 2.
          cooldown.noteRateLimit('tier3', undefined);
        }
        log.warn('Translator', `Tier 3 (Google) → Failed → Escalating | ${err.message}`);
        events.emit(EVENT_TYPES.TRANSLATOR_TIER_FAILED, { tier: 3, error: err.message });
      }
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

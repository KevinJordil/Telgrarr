'use strict';
const axios   = require('axios');
const config  = require('./config');
const log     = require('./logger');
const events  = require('./events');
const EVENT_TYPES = require('../shared/events.json');

const ARABIC_RE = /[؀-ۿ]/;

async function translateText(text, { fallback = null } = {}) {
  if (!text) return fallback;
  if (ARABIC_RE.test(text)) return text;

  // ── Tier 1: GitHub/Azure OpenAI-compatible LLM ──────────────────────────────
  const t1Key      = config.translator?.apiKey;
  const t1Endpoint = config.translator?.endpoint || 'https://models.inference.ai.azure.com/chat/completions';
  const t1Model    = config.translator?.model    || 'gpt-4o-mini';

  if (t1Key) {
    try {
      const res = await axios.post(
        t1Endpoint,
        {
          model: t1Model,
          messages: [
            { role: 'system', content: 'You are an elite cinematic translator. Translate the provided English text into professional Arabic. If the text is a plot overview, keep it concise, captivating, and STRICTLY spoiler-free — do not reveal plot twists or endings. Output ONLY the Arabic text. No quotes, no markdown, no explanations.' },
            { role: 'user',   content: text }
          ],
          temperature: 0.3
        },
        { headers: { 'Authorization': `Bearer ${t1Key}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
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
  if (t2Key) {
    try {
      const res = await axios.post(
        'https://api-free.deepl.com/v2/translate',
        new URLSearchParams({ auth_key: t2Key, text, source_lang: 'EN', target_lang: 'AR' }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
      );
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
  } else {
    log.warn('Translator', 'Tier 2 (DeepL) → Skipped → deeplApiKey not configured');
  }

  // ── Tier 3: Google Translate (unofficial) ───────────────────────────────────
  try {
    const res = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=${encodeURIComponent(text)}`,
      { timeout: 8000 }
    );
    const translated = res.data?.[0]?.[0]?.[0];
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

  // ── Tier 4: Graceful degradation ────────────────────────────────────────────
  log.warn('Translator', `Translation → Skipped → All tiers exhausted | Length: [${text.length}]`);
  events.emit(EVENT_TYPES.TRANSLATOR_SKIPPED, { length: text.length });
  return fallback;
}

module.exports = { translateText };

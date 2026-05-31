'use strict';

const axios = require('axios');

const AI_DEFAULT_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';
const AI_DEFAULT_MODEL = 'gpt-4o-mini';

async function testTelegram(botToken, chatId) {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text: 'Telgrarr connection test — OK',
      parse_mode: 'HTML'
    }, { timeout: 8000 });
    return { success: true, message: 'Test message sent successfully.' };
  } catch (error) {
    return { success: false, error: error.response?.data?.description ?? error.message };
  }
}

async function testSonarr(baseUrl, apiKey) {
  try {
    const cleanUrl = (baseUrl || '').replace(/\/+$/, '');
    const response = await axios.get(`${cleanUrl}/api/v3/system/status`, {
      headers: { 'X-Api-Key': apiKey || '' },
      timeout: 8000
    });
    return { success: true, version: response.data.version, appName: response.data.appName };
  } catch (error) {
    const msg = error.response ? `HTTP ${error.response.status} — check URL and API key` : error.message;
    return { success: false, error: msg };
  }
}

async function testRadarr(baseUrl, apiKey) {
  try {
    const cleanUrl = (baseUrl || '').replace(/\/+$/, '');
    const response = await axios.get(`${cleanUrl}/api/v3/system/status`, {
      headers: { 'X-Api-Key': apiKey || '' },
      timeout: 8000
    });
    return { success: true, version: response.data.version, appName: response.data.appName };
  } catch (error) {
    const msg = error.response ? `HTTP ${error.response.status} — check URL and API key` : error.message;
    return { success: false, error: msg };
  }
}

async function testEmby(refreshUrl, apiKey) {
  if (!refreshUrl || refreshUrl.trim() === '') {
    return { success: false, error: 'Emby refresh URL is empty' };
  }
  try {
    const baseUrl = refreshUrl.replace(/\/?Library\/Refresh\/?$/i, '');
    const response = await axios.get(`${baseUrl}/System/Ping`, {
      params: { api_key: apiKey },
      timeout: 8000
    });
    if (response.status === 200) {
      return { success: true, message: 'Emby is reachable.' };
    } else {
      return { success: false, error: `HTTP ${response.status} — check URL and API key` };
    }
  } catch (error) {
    const msg = error.response ? `HTTP ${error.response.status} — check URL and API key` : error.message;
    return { success: false, error: msg };
  }
}

async function testOmdb(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, error: 'No OMDb API key configured' };
  }
  try {
    const response = await axios.get('https://www.omdbapi.com/', {
      params: { apikey: apiKey, t: 'test' },
      timeout: 8000
    });
    // Legacy failure semantic: only explicitly flagged invalid API keys fail the connection test
    if (response.data && response.data.Error && /invalid api key/i.test(response.data.Error)) {
      return { success: false, error: 'Invalid API key' };
    }
    return { success: true, message: 'OMDb API key is valid.' };
  } catch (error) {
    return { success: false, error: error.response?.status ? `HTTP ${error.response.status}` : error.message };
  }
}

async function testTranslatorAi(endpoint, model, apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, error: 'No AI API key configured' };
  }
  try {
    const activeEndpoint = endpoint || AI_DEFAULT_ENDPOINT;
    const activeModel = model || AI_DEFAULT_MODEL;
    await axios.post(activeEndpoint, {
      model: activeModel,
      messages: [{ role: 'user', content: '1' }],
      max_tokens: 1
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000
    });
    return { success: true, message: 'AI translator endpoint and key are valid.' };
  } catch (error) {
    return { success: false, error: error.response?.data?.error?.message ?? (error.response?.status ? `HTTP ${error.response.status}` : error.message) };
  }
}

async function testTranslatorDeepl(deeplApiKey) {
  if (!deeplApiKey || deeplApiKey.trim() === '') {
    return { success: false, error: 'No DeepL API key configured' };
  }
  try {
    const response = await axios.get('https://api-free.deepl.com/v2/usage', {
      headers: { 'Authorization': `DeepL-Auth-Key ${deeplApiKey}` },
      timeout: 8000
    });
    return {
      success: true,
      character_count: response.data.character_count,
      character_limit: response.data.character_limit
    };
  } catch (error) {
    return { success: false, error: error.response?.status === 403 ? 'Invalid DeepL API key' : (error.response?.status ? `HTTP ${error.response.status}` : error.message) };
  }
}

module.exports = {
  testTelegram,
  testSonarr,
  testRadarr,
  testEmby,
  testOmdb,
  testTranslatorAi,
  testTranslatorDeepl,
  AI_DEFAULT_ENDPOINT,
  AI_DEFAULT_MODEL
};

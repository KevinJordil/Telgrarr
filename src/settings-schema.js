'use strict';


const { STANDARD_PLOT_PROMPT } = require('./translator-prompts');
const SETTINGS_SCHEMA = [
  {
    id: 'telegram', title: 'Telegram', icon: 'Send',
    testEndpoint: '/api/settings/test/telegram', testLabel: 'Send Test Message',
    fields: [
      { key: 'telegram.botToken', bootRequired: 'Telegram bot token', label: 'Bot Token', type: 'secret', placeholder: '1234567890:AAExxx...', required: true, rule: 'telegramToken' },
      { key: 'telegram.chatId', bootRequired: 'Telegram chat ID', label: 'Chat ID', type: 'text', placeholder: '-1001234567890', required: true, rule: 'chatId' },
      { key: 'telegram.delayMs', label: 'Delay Between Messages', type: 'slider',
        min: 500, max: 10000, step: 500, displayFormat: 'ms-to-s',
        note: 'Pause between consecutive messages in one batch.', integer: true,
        errorMessage: 'Must be between 500ms and 10000ms' },
    ],
  },
  {
    id: 'queue', title: 'Queue & Timing', icon: 'Timer',
    fields: [
      { key: 'batchWindowMs', label: 'Batch Window', type: 'slider',
        min: 30000, max: 1800000, step: 30000, displayFormat: 'ms-to-min',
        note: 'Wait time before processing a batch. Takes effect on the next new batch only.', integer: true,
        errorMessage: 'Must be between 30000 (30s) and 1800000 (30min)' },
    ],
  },
  {
    id: 'sonarr', title: 'Sonarr', icon: 'Tv',
    testEndpoint: '/api/settings/test/sonarr', testLabel: 'Test Connection',
    fields: [
      { key: 'sonarr.baseUrl', bootRequired: 'Sonarr base URL', label: 'Base URL', type: 'url', placeholder: 'http://127.0.0.1:8989', required: true, rule: 'url' },
      { key: 'sonarr.apiKey', bootRequired: 'Sonarr API key', label: 'API Key', type: 'secret', placeholder: 'Your Sonarr API key', note: 'Found in Sonarr under Settings → General → API Key.', required: true },
      { key: 'sonarr.includePlot', label: 'Include Plot', type: 'toggle', note: 'Add the series plot/overview to Sonarr notifications, translated to your metadata language. Turn off to skip the extra metadata lookup.' },
    ],
  },
  {
    id: 'radarr', title: 'Radarr', icon: 'Film',
    testEndpoint: '/api/settings/test/radarr', testLabel: 'Test Connection',
    fields: [
      { key: 'radarr.baseUrl', bootRequired: 'Radarr base URL', label: 'Base URL', type: 'url', placeholder: 'http://127.0.0.1:7878', required: true, rule: 'url' },
      { key: 'radarr.apiKey', bootRequired: 'Radarr API key', label: 'API Key', type: 'secret', placeholder: 'Your Radarr API key', note: 'Found in Radarr under Settings → General → API Key.', required: true },
      { key: 'radarr.includePlot', label: 'Include Plot', type: 'toggle', note: 'Add the movie plot/overview to Radarr notifications, translated to your metadata language. Turn off to skip the extra metadata lookup.' },
    ],
  },
  {
    id: 'emby', title: 'Emby / Jellyfin', icon: 'Play',
    testEndpoint: '/api/settings/test/emby', testLabel: 'Test Connection',
    fields: [
      { key: 'emby.refreshUrl', label: 'Library Refresh URL', type: 'url', placeholder: 'http://your-emby-or-jellyfin:8096/Library/Refresh', note: 'Emby and Jellyfin both use this endpoint. Find it under Dashboard → API Keys → copy your server URL and append /Library/Refresh. Leave empty to disable library refresh.', required: false, rule: 'url' },
      { key: 'emby.apiKey', label: 'API Key', type: 'secret', placeholder: 'Your Emby or Jellyfin API key', note: 'Generate under Dashboard → API Keys. Required for the refresh to succeed.', required: false },
    ],
  },
  {
    id: 'tmdb', title: 'TMDb', icon: 'Star',
    testEndpoint: '/api/settings/test/tmdb', testLabel: 'Test API Key',
    fields: [
      { key: 'tmdb.apiKey', bootRequired: 'TMDB API key', label: 'API Key', type: 'secret', placeholder: 'Your TMDb v3 API key', required: true },
    ],
  },
  {
    id: 'seerr', title: 'Seerr', icon: 'Search',
    testEndpoint: '/api/settings/test/seerr', testLabel: 'Test Connection',
    fields: [
      { key: 'seerr.baseUrl', label: 'Base URL', type: 'url', placeholder: 'https://your-seerr-instance', required: false, rule: 'url' },
    ],
  },
  {
    id: 'omdb', title: 'OMDb', icon: 'Database',
    testEndpoint: '/api/settings/test/omdb', testLabel: 'Test API Key',
    fields: [
      { key: 'omdb.apiKey', label: 'API Key', type: 'secret', placeholder: 'Your OMDb API key',
        note: 'Optional. Used as a fallback source for IMDb, Rotten Tomatoes, and Metacritic ratings when Radarr has not yet synced them. Leave empty to disable.', required: false,
        mustBeString: true },
    ],
  },
  {
    id: 'translator', title: 'AI Translator', icon: 'Languages',
    testEndpoint: '/api/settings/test/translator-ai', testLabel: 'Test AI Key',
    fields: [
      { key: 'translator.endpoint', label: 'API Endpoint (OpenAI Compatible)', type: 'url',
        placeholder: 'https://models.inference.ai.azure.com/chat/completions',
        note: 'Optional. The chat completions endpoint for your AI provider (OpenAI, OpenRouter, Groq, etc.). Leave empty to use the built-in default endpoint.', required: false, rule: 'url',
        nonWhitespaceIfProvided: true },
      { key: 'translator.model', label: 'AI Model', type: 'text',
        placeholder: 'gpt-4o-mini',
        note: 'The exact model ID to request (e.g., gpt-4o-mini, deepseek/deepseek-chat).', required: false,
        nonWhitespaceIfProvided: true },
      { key: 'translator.apiKey', label: 'API Key', type: 'secret',
        placeholder: 'sk-...',
        note: 'Required for AI translations (Tier 1). If empty, translations will be skipped.', required: false },
      { key: 'translator.targetLang', label: 'Translation Language', type: 'select',
        options: [ { value: 'ar', label: 'Arabic' } ],
        note: 'Target language for AI-translated plot and genres. Default: Arabic.' },
      { key: 'translator.deeplApiKey', label: 'DeepL Free API Key', type: 'secret',
        placeholder: 'xxxxxxxxxxxxxxxx',
        note: 'Tier 2 fallback — get free key at deepl.com/pro#developer (500k chars/month).', required: false },
      { key: 'translator.googleEndpoint', label: 'Google Translate Endpoint', type: 'url', required: false, rule: 'googleEndpoint',
        placeholder: 'https://translation.googleapis.com/language/translate/v2',
        note: 'Official Google Cloud Translation v2 endpoint (Tier 3). Used only when a Google API Key is set; otherwise the keyless fallback applies.' },
      { key: 'translator.googleApiKey', label: 'Google Translate API Key', type: 'secret', required: false, rule: 'googleKey',
        placeholder: 'AIza...',
        note: 'Optional. A Google Cloud Translation API key promotes Tier 3 to the official API. Leave empty to use the keyless fallback.' },
      { key: 'translator.aiEnabled', label: 'Enable AI Translation (Tier 1)', type: 'toggle',
        note: 'Use the AI/LLM translator (Tier 1). Requires an API Key. Turn off to skip Tier 1.' },
      { key: 'translator.deeplEnabled', label: 'Enable DeepL (Tier 2)', type: 'toggle',
        note: 'Use DeepL (Tier 2) as a fallback. Requires the DeepL Free API Key. Turn off to skip Tier 2.' },
      { key: 'translator.googleEnabled', label: 'Enable Google (Tier 3)', type: 'toggle',
        note: 'Use the keyless Google endpoint (Tier 3) as the final fallback. Turn off to skip Tier 3.' },
      { key: 'translator.shortPlot', label: 'Ultra-short / No-spoiler Plot', type: 'toggle',
        note: 'Use a concise, strictly spoiler-free prompt variant for plot translation: a short teaser instead of a full overview. Off = standard prompt.' },
      { key: 'translator.systemPrompt', label: 'AI System Prompt (read-only)', type: 'display', value: STANDARD_PLOT_PROMPT,
        note: 'The exact instruction sent to the AI translator (Tier 1); {lang} is your selected translation language. Read-only. When Ultra-short is enabled, a concise spoiler-free variant is used.' },
    ],
  },
  {
    id: 'mediaCache', title: 'Media Cache', icon: 'Database',
    fields: [
      { key: 'mediaCache.ttlDays', label: 'Cache TTL (Days)', type: 'slider',
        min: 1, max: 90, step: 1,
        note: 'How long TMDb and OMDb metadata is cached before re-fetching. Default: 30 days.', integer: true },
      { key: 'mediaCache.maxEntries', label: 'Max Cache Entries', type: 'slider',
        min: 50, max: 500, step: 50,
        note: 'Maximum number of titles stored in cache. Oldest entry is evicted when limit is reached. Default: 500.', integer: true },
    ],
  },
  {
    id: 'logging', title: 'Logging', icon: 'FileText',
    fields: [
      { key: 'logging.level', label: 'Log Level', type: 'select',
        options: [
          { value: 'info',  label: 'Info — standard operational output' },
          { value: 'warn',  label: 'Warn — suppressions and degraded states only' },
          { value: 'error', label: 'Error — failures only' },
        ],
        note: 'Controls which log levels are written to disk and console. Requires restart.' },
      { key: 'logging.rotation.app.maxSizeMb', label: 'App Log Max Size (MB)', type: 'slider', min: 1, max: 50, step: 1, note: 'Roll app.log when it reaches this size.', integer: true },
      { key: 'logging.rotation.app.maxAgeDays', label: 'App Log Max Age (Days)', type: 'slider', min: 1, max: 30, step: 1, note: 'Delete app.log archives older than this.', integer: true },
      { key: 'logging.rotation.error.maxSizeMb', label: 'Error Log Max Size (MB)', type: 'slider', min: 1, max: 50, step: 1, note: 'Roll error.log when it reaches this size.', integer: true },
      { key: 'logging.rotation.error.maxAgeDays', label: 'Error Log Max Age (Days)', type: 'slider', min: 1, max: 90, step: 1, note: 'Delete error.log archives older than this.', integer: true },
      { key: 'logging.rotation.audit.maxSizeMb', label: 'Audit Log Max Size (MB)', type: 'slider', min: 1, max: 20, step: 1, note: 'Roll audit.log when it reaches this size.', integer: true },
      { key: 'logging.rotation.audit.maxAgeDays', label: 'Audit Log Max Age (Days)', type: 'slider', min: 7, max: 365, step: 1, note: 'Delete audit.log archives older than this.', integer: true },
    ],
  },
  {
    id: 'network', title: 'Server', icon: 'Server',
    fields: [
      { key: 'listenerPort', envVar: 'PORT', label: 'Listener Port', type: 'number',
        placeholder: '3400', integer: true, min: 1025, max: 65534,
        note: 'TCP port the server listens on. Requires restart. If set via the PORT environment variable it is managed by your environment and shown read-only.' },
      { key: 'listenerHost', envVar: 'HOST', label: 'Listener Host', type: 'text',
        placeholder: '0.0.0.0', required: false, rule: 'host',
        note: 'Network interface to bind. 0.0.0.0 = all interfaces; 127.0.0.1 = local only. Leave empty for the default. Requires restart. If set via the HOST environment variable it is managed by your environment and shown read-only.' },
      { key: 'publicBaseUrl', label: 'Public Base URL', type: 'url', required: false, rule: 'url',
        placeholder: 'https://telgrarr.example.com',
        note: 'The address Sonarr/Radarr and your browser use to reach TELGRARR. Used to build the copy-ready webhook URLs in the Sonarr and Radarr sections. Leave empty to auto-detect from your current address.' },
    ],
  },
  {
    id: 'advanced', title: 'Advanced / Deployment', icon: 'Lock',
    fields: [
      { key: 'corsOrigin', envVar: 'CORS_ORIGIN', label: 'CORS Origin', type: 'url', required: false, rule: 'url',
        placeholder: 'https://app.example.com',
        note: 'Allow browser requests from ONE exact origin (scheme + host + port). Leave empty for same-origin only (the safe default). Requires restart. Read-only if set via the CORS_ORIGIN environment variable.' },
      { key: 'trustProxy', envVar: 'TRUST_PROXY', label: 'Trust Proxy', type: 'text', required: false, rule: 'trustProxy',
        placeholder: 'false',
        note: 'Trust X-Forwarded-* headers from a front proxy. Empty or false = off (safe). Use true, a hop count, or a proxy IP/CIDR ONLY behind a proxy you control - on a directly exposed server it lets clients spoof their IP. Requires restart.' },
      { key: 'cookieSecure', envVar: 'COOKIE_SECURE', label: 'Secure Cookies', type: 'select',
        options: [
          { value: 'auto', label: 'Auto - Secure only over HTTPS (recommended)' },
          { value: 'true', label: 'Always - require HTTPS' },
          { value: 'false', label: 'Never - allow plain HTTP' },
        ],
        note: 'Controls the Secure flag on the session cookie. Auto enables it when the request is HTTPS. Requires restart.' },
    ],
  },
];

module.exports = { SETTINGS_SCHEMA };

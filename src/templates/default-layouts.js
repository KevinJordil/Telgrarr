'use strict';

const DEFAULT_SONARR_TEMPLATE = `<b>{{headerEmoji}} {{headerText}}</b>

📺 <b>{{title}}</b>

{{separator}}
{{#if year}}

‏📆 سنة البث: ⁦{{year}}⁩{{#if statusAr}} - ⁦{{statusAr}}⁩{{/if}}{{/if}}{{#if genres}}

‏🎭 {{genres}}{{/if}}{{#if overview}}

‏📝 {{{overview}}}{{/if}}

‏📺 <b>الموسم:</b> {{seasonRange}}

‏🎬 <b>{{epLabel}}</b> {{epValue}}{{#if runtime}}

‏⏳ <b>مدة الحلقة:</b> {{runtime}}{{/if}}
{{#if imdbUrl}}

🔗 <a href="{{imdbUrl}}">رابط ⁦IMDb⁩</a>{{/if}}{{#if seerrUrl}}

🔗 <a href="{{seerrUrl}}">رابط ⁦موقع السيرفر⁩</a>{{/if}}

&#8203;`;

const DEFAULT_SONARR_EN = `<b>{{headerEmoji}} New Series Added</b>

📺 <b>{{title}}</b>

{{separator}}
{{#if year}}

📆 <b>Year:</b> {{year}}{{#if status_en}} - {{status_en}}{{/if}}{{/if}}{{#if genresEn}}

🎭 {{genresEn}}{{/if}}{{#if overview}}

📝 {{{overview}}}{{/if}}

📺 <b>Season:</b> {{seasonRange}}

🎬 <b>{{epLabel_en}}</b> {{epValue_en}}{{#if runtime_en}}

⏳ <b>Runtime:</b> {{runtime_en}}{{/if}}
{{#if imdbUrl}}

🔗 <a href="{{imdbUrl}}">IMDb Link</a>{{/if}}{{#if seerrUrl}}

🔗 <a href="{{seerrUrl}}">Server Link</a>{{/if}}

&#8203;`;

const DEFAULT_RADARR_TEMPLATE = `<b>{{headerEmoji}} {{headerText}}</b>

🎥 <b>{{title}}</b>

{{separator}}
{{#if year}}

‏📅 سنة الإصدار: {{year}}{{/if}}{{#if genres}}

‏🎭 {{genres}}{{/if}}{{#if overview}}

‏📝 {{{overview}}}{{/if}}
{{#if runtime}}

‏🕓 المدة: {{runtime}}{{/if}}{{#if ratings.imdb}}

‏⭐ تقييم ⁦IMDb⁩ ⁦({{ratings.imdb}})⁩{{/if}}{{#if ratings.tmdb}}

‏🔵 تقييم ⁦TMDb⁩ ⁦({{ratings.tmdb}})⁩{{/if}}{{#if ratings.rottenTomatoes}}

‏🍅 تقييم ⁦Rotten Tomatoes⁩ ⁦({{ratings.rottenTomatoes}})⁩{{/if}}{{#if ratings.metacritic}}

‏🎖 تقييم ⁦Metacritic⁩ ⁦({{ratings.metacritic}})⁩{{/if}}
{{#if imdbUrl}}

🔗 <a href="{{imdbUrl}}">رابط ⁦IMDb⁩</a>{{/if}}{{#if seerrUrl}}

🔗 <a href="{{seerrUrl}}">رابط ⁦موقع السيرفر⁩</a>{{/if}}

&#8203;`;

const DEFAULT_RADARR_EN = `<b>{{headerEmoji}} New Movie Added</b>

🎥 <b>{{title}}</b>

{{separator}}
{{#if year}}

📅 {{year}}{{/if}}{{#if genresEn}}

🎭 {{genresEn}}{{/if}}{{#if overview}}

📝 {{{overview}}}{{/if}}
{{#if runtime_en}}

🕓 <b>Runtime:</b> {{runtime_en}}{{/if}}{{#if ratings.imdb}}

⭐ IMDb ⁦({{ratings.imdb}})⁩{{/if}}{{#if ratings.tmdb}}

🔵 TMDb ⁦({{ratings.tmdb}})⁩{{/if}}{{#if ratings.rottenTomatoes}}

🍅 Rotten Tomatoes ⁦({{ratings.rottenTomatoes}})⁩{{/if}}{{#if ratings.metacritic}}

🎖 Metacritic ⁦({{ratings.metacritic}})⁩{{/if}}
{{#if imdbUrl}}

🔗 <a href="{{imdbUrl}}">IMDb Link</a>{{/if}}{{#if seerrUrl}}

🔗 <a href="{{seerrUrl}}">Server Link</a>{{/if}}

&#8203;`;

module.exports = {
  DEFAULT_SONARR_TEMPLATE,
  DEFAULT_SONARR_EN,
  DEFAULT_RADARR_TEMPLATE,
  DEFAULT_RADARR_EN
};

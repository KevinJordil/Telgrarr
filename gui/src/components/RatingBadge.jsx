// RatingBadge — source-attributed rating pill.
//
// AUTHORIZED DIVERGENCE [HIST HD-6]: brand hex values below are intentional
// fidelity to recognizable rating-source branding and are EXEMPT from R15
// (UI-tokens-only rule). Same class as TelegramMock §7 exemption.
// Do NOT tokenize these colors.
//
// IMDb   #F5C518 bg / dark text
// RT     #FA320A bg (<60%) or #6AC238 bg (≥60%) / white text
// TMDb   #01D277 bg / white text
// MC     #FF0000 (0-39) / #FFCC33 (40-60) / #6AC238 (61-100) bg

/**
 * @param {{ source: 'imdb'|'rt'|'tmdb'|'metacritic', score: string|number|null|undefined, className?: string }} props
 */
export default function RatingBadge({ source, score, className }) {
  if (score === null || score === undefined || score === '') return null;

  let label, formatted, bg, textColor, ariaLabel;

  if (source === 'imdb') {
    const val = parseFloat(score);
    if (isNaN(val) || val <= 0) return null;
    formatted  = val.toFixed(1);
    label      = 'IMDb';
    bg         = '#F5C518';
    textColor  = '#000000';
    ariaLabel  = 'IMDb rating: ' + formatted + ' out of 10';

  } else if (source === 'rt') {
    const val = parseInt(String(score).replace('%', ''), 10);
    if (isNaN(val) || val < 0) return null;
    formatted  = val + '%';
    label      = '\uD83C\uDF45'; // 🍅 via surrogate pair — safe in JSX
    bg         = val >= 60 ? '#6AC238' : '#FA320A';
    textColor  = '#ffffff';
    ariaLabel  = 'Rotten Tomatoes: ' + formatted;

  } else if (source === 'tmdb') {
    const val = parseFloat(score);
    if (isNaN(val) || val <= 0) return null;
    formatted  = val.toFixed(1);
    label      = 'TMDb';
    bg         = '#01D277';
    textColor  = '#ffffff';
    ariaLabel  = 'TMDb rating: ' + formatted + ' out of 10';

  } else if (source === 'metacritic') {
    const val = parseInt(String(score), 10);
    if (isNaN(val) || val < 0) return null;
    formatted  = String(val);
    bg         = val >= 61 ? '#6AC238' : val >= 40 ? '#FFCC33' : '#FF0000';
    textColor  = (val >= 40 && val <= 60) ? '#000000' : '#ffffff';
    label      = 'MC';
    ariaLabel  = 'Metacritic score: ' + formatted + ' out of 100';

  } else {
    return null;
  }

  return (
    <span
      className={'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold leading-none ' + (className || '')}
      style={{ backgroundColor: bg, color: textColor }}
      aria-label={ariaLabel}
      role="img"
    >
      <span aria-hidden="true">{label}</span>
      <span>{formatted}</span>
    </span>
  );
}

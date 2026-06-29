// Time formatting utility — Time Contract (HIST roadmap).
// All Intl calls omit timeZone → browser local timezone, automatic, zero-config.
// Pure functions: no side effects, no imports.

/**
 * Format an ISO 8601 UTC string as a human-readable relative time.
 * <60s → "just now"; <60m → "N min ago"; <24h → "N hours ago";
 * <48h → "yesterday"; <7d → "N days ago"; ≥7d → formatAbsoluteTime().
 * @param {string} isoString
 * @returns {string}
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffS  = Math.floor(diffMs / 1000);
  const diffM  = Math.floor(diffMs / 60000);
  const diffH  = Math.floor(diffMs / 3600000);
  const diffD  = Math.floor(diffMs / 86400000);

  if (diffS < 60)  return 'just now';
  if (diffM < 60)  return diffM + ' min ago';
  if (diffH < 24)  return diffH + ' hour' + (diffH === 1 ? '' : 's') + ' ago';
  if (diffD < 2)   return 'yesterday';
  if (diffD < 7)   return diffD + ' days ago';
  return formatAbsoluteTime(isoString);
}

/**
 * Format as locale date + time: "Jun 28, 2026, 2:30 PM".
 * @param {string} isoString
 * @returns {string}
 */
export function formatAbsoluteTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * Format as full datetime with weekday and timezone name:
 * "Saturday, June 28, 2026 at 2:30:00 PM EDT".
 * Intended for tooltip/title use.
 * @param {string} isoString
 * @returns {string}
 */
export function formatFullTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    weekday:      'long',
    year:         'numeric',
    month:        'long',
    day:          'numeric',
    hour:         'numeric',
    minute:       '2-digit',
    second:       '2-digit',
    timeZoneName: 'short',
  }).format(d);
}

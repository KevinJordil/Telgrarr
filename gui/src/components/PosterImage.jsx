import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Size-variant map for TMDb CDN URLs (HD-9).
const SIZE_MAP = { xs: 'w92', sm: 'w154', md: 'w342', lg: 'w500' };

// Matches the TMDb CDN size segment in a URL, e.g. "image.tmdb.org/t/p/w500/".
// Only URLs matching this pattern get size substitution; all others are used as-is.
const TMDB_CDN_RE = /image\.tmdb\.org\/t\/p\/(?:w\d+|original)\//;

function resolveUrl(url, size) {
  if (!url) return null;
  const variant = SIZE_MAP[size];
  if (!variant) return url;
  if (TMDB_CDN_RE.test(url)) {
    return url.replace(TMDB_CDN_RE, 'image.tmdb.org/t/p/' + variant + '/');
  }
  return url;
}

// ---- Session image caches (HIST-UPG P1) -------------------------------------
// Module-level, session-scoped, bounded in practice (short URL strings).
// loadedUrls: URLs that finished loading this session; a remount renders them
// at full opacity instantly (no blank + re-fade on view switches).
// failedUrls: URLs that errored (no per-mount retry churn).
// bestVariant: per-artwork key (URL minus its CDN size segment) -> the most
// recently loaded variant, shown as a stand-in while another size loads.
const loadedUrls  = new Set();
const failedUrls  = new Set();
const bestVariant = new Map();
function variantKey(u) {
  return u.replace(TMDB_CDN_RE, 'image.tmdb.org/t/p/{s}/');
}

// Film-reel silhouette placeholder — inherits text-telgrarr-muted for stroke.
function Placeholder({ className }) {
  return (
    <div className={'flex items-center justify-center bg-telgrarr-surface ' + (className || '')}>
      <svg
        viewBox="0 0 24 24"
        className="w-10 h-10 text-telgrarr-muted opacity-40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="8"  cy="12" r="2" />
        <circle cx="16" cy="12" r="2" />
        <path d="M2 9h2M2 15h2M20 9h2M20 15h2" />
      </svg>
    </div>
  );
}

/**
 * Poster image with TMDb CDN size-swapping, lazy loading, animated fade-in,
 * a film-reel silhouette fallback on error, and session URL caches: an
 * already-loaded URL renders instantly on remount, and while a new size
 * variant loads, an already-loaded sibling variant of the same artwork
 * is shown beneath it (no blank card on view/size switches).
 *
 * @param {{ url?: string, size?: 'xs'|'sm'|'md'|'lg', alt: string, className?: string }} props
 */
export default function PosterImage({ url, size = 'md', alt, className }) {
  // Per-URL knowledge lives in the module caches above; this state exists
  // only to re-render when the CURRENT url's cache status changes.
  const [, bump] = useState(0);
  const prefersReduced = useReducedMotion();
  const wrapClass = 'relative aspect-[2/3] overflow-hidden rounded-lg bg-telgrarr-surface ' + (className || '');
  const resolved = resolveUrl(url, size);
  if (!resolved) {
    return <Placeholder className={wrapClass} />;
  }
  const isLoaded = loadedUrls.has(resolved);
  const isFailed = failedUrls.has(resolved);
  // Already-loaded sibling variant of the same artwork (different CDN size):
  // shown beneath the incoming image so size/view switches never blank the
  // card; also the graceful stand-in if the requested variant errors.
  const fallbackSrc = !isLoaded ? (bestVariant.get(variantKey(resolved)) || null) : null;
  if (isFailed) {
    if (!fallbackSrc) return <Placeholder className={wrapClass} />;
    return (
      <div className={wrapClass}>
        <img src={fallbackSrc} alt={alt || ''} draggable={false}
          className="absolute inset-0 w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div className={wrapClass}>
      {fallbackSrc && (
        <img src={fallbackSrc} alt="" aria-hidden="true" draggable={false}
          className="absolute inset-0 w-full h-full object-cover" />
      )}
      <motion.img
        key={resolved}
        src={resolved}
        alt={alt || ''}
        loading="lazy"
        onLoad={() => { loadedUrls.add(resolved); bestVariant.set(variantKey(resolved), resolved); bump((n) => n + 1); }}
        onError={() => { failedUrls.add(resolved); bump((n) => n + 1); }}
        initial={isLoaded ? false : { opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
        className="relative w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

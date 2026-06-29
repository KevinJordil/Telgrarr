import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Size-variant map for TMDb CDN URLs (HD-9).
const SIZE_MAP = { xs: 'w92', sm: 'w154', md: 'w342', lg: 'w500' };

// Matches the TMDb CDN size segment in a URL, e.g. "image.tmdb.org/t/p/w500/".
// Only URLs matching this pattern get size substitution; all others are used as-is.
const TMDB_CDN_RE = /image\.tmdb\.org\/t\/p\/w\d+\//;

function resolveUrl(url, size) {
  if (!url) return null;
  const variant = SIZE_MAP[size];
  if (!variant) return url;
  if (TMDB_CDN_RE.test(url)) {
    return url.replace(TMDB_CDN_RE, 'image.tmdb.org/t/p/' + variant + '/');
  }
  return url;
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
 * and a film-reel silhouette fallback on error.
 *
 * @param {{ url?: string, size?: 'xs'|'sm'|'md'|'lg', alt: string, className?: string }} props
 */
export default function PosterImage({ url, size = 'md', alt, className }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prefersReduced = useReducedMotion();

  const wrapClass = 'aspect-[2/3] overflow-hidden rounded-lg bg-telgrarr-surface ' + (className || '');
  const resolved  = resolveUrl(url, size);

  if (!resolved || failed) {
    return <Placeholder className={wrapClass} />;
  }

  return (
    <div className={wrapClass}>
      <motion.img
        src={resolved}
        alt={alt || ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={prefersReduced ? { duration: 0 } : { duration: 0.2 }}
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

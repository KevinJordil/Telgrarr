import { Film, Tv } from 'lucide-react';

/**
 * Small type-indicator pill: "Movie" (amber) or "Show" (purple).
 * Uses telgrarr design tokens only — no hardcoded hex (R15 compliant).
 *
 * @param {{ type: 'show'|'movie', className?: string }} props
 */
export default function SourceBadge({ type, className }) {
  const isMovie = type === 'movie';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ' +
        (isMovie
          ? 'bg-telgrarr-warning/20 text-telgrarr-warning'
          : 'bg-telgrarr-purple/20 text-telgrarr-purple') +
        (className ? ' ' + className : '')
      }
      aria-label={isMovie ? 'Movie' : 'Show'}
    >
      {isMovie
        ? <Film className="w-3 h-3" aria-hidden="true" />
        : <Tv   className="w-3 h-3" aria-hidden="true" />
      }
      <span>{isMovie ? 'Movie' : 'Show'}</span>
    </span>
  );
}

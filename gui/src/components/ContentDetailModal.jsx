import { useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';
import useHistoryStore from '../store/historyStore';
import PosterImage from './PosterImage';
import RatingBadge from './RatingBadge';
import SourceBadge from './SourceBadge';
import { formatRelativeTime, formatFullTime } from '../utils/timeFormat';

// Unique ID counter for ARIA labelling — same pattern as ConfirmModal.
let idSeq = 0;

// ── ModalContent ─────────────────────────────────────────────────────────────
// Kept separate from ContentDetailModal so the outer shell can hold the
// lastEntryRef snapshot while AnimatePresence plays the dismiss animation
// after detailEntry is cleared to null.
function ModalContent({ entry, titleId, closeRef, onClose }) {
  const ratings    = entry.ratings || {};
  const hasRatings = !!(
    ratings.imdb || ratings.tmdb || ratings.rottenTomatoes || ratings.metacritic
  );
  const hasBackdrop = Boolean(entry.backdropUrl);
  const hasEpisodes = (
    entry.type === 'show' &&
    Array.isArray(entry.episodes) &&
    entry.episodes.length > 0
  );

  // Runtime: prefer the structured number field (minutes); fall back to the
  // legacy details string for old movie entries only (stored as "136 min").
  const runtimeDisplay = entry.runtime
    ? `${entry.runtime} min`
    : entry.type === 'movie'
      ? (entry.details ?? null)
      : null;

  const sentRelative = formatRelativeTime(entry.timestamp);
  const sentFull     = formatFullTime(entry.timestamp);

  // type='show' maps to TMDb /tv/; type='movie' to /movie/.
  const tmdbUrl = entry.tmdbId
    ? `https://www.themoviedb.org/${entry.type === 'show' ? 'tv' : 'movie'}/${entry.tmdbId}`
    : null;
  const imdbUrl = entry.imdbId
    ? `https://www.imdb.com/title/${entry.imdbId}/`
    : null;

  return (
    <>
      {/* ── Backdrop / hero header ──────────────────────────────────────────── */}
      <div className="relative shrink-0 h-44 md:h-52 rounded-t-2xl overflow-hidden">
        {hasBackdrop ? (
          <>
            <img
              src={entry.backdropUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dimming veil so the close button stays readable over the image */}
            <div className="absolute inset-0 bg-telgrarr-black/60" />
          </>
        ) : (
          /* Gradient fallback — telgrarr tokens only (R15) */
          <div className="absolute inset-0 bg-linear-to-br from-telgrarr-purple/25 via-telgrarr-elevated to-telgrarr-black" />
        )}

        {/* Close button — receives initial focus on open */}
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="focus-ring absolute top-3 right-3 z-[1] flex items-center justify-center w-8 h-8 rounded-full bg-telgrarr-black/60 text-white hover:bg-telgrarr-black/80 transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* ── Poster + metadata ───────────────────────────────────────────────── */}
      {/* Negative margin overlaps the poster into the bottom of the backdrop. */}
      <div className="flex flex-col items-center md:flex-row md:items-end gap-4 px-5 md:px-6 -mt-10 md:-mt-14 relative">
        {/* Poster */}
        <div className="shrink-0 w-24 md:w-36">
          <PosterImage
            url={entry.poster}
            size="lg"
            alt={entry.title || ''}
            className="ring-1 ring-telgrarr-border/50 shadow-xl"
          />
        </div>

        {/* Info block */}
        <div className="flex-1 min-w-0 text-center md:text-left md:pb-1">
          {/* Title + year + type badge */}
          <div className="flex flex-wrap items-start justify-center md:justify-start gap-2 mb-0.5">
            <h2 id={titleId} className="text-lg md:text-xl font-bold text-telgrarr-text leading-tight">
              {entry.title || ''}
              {entry.year
                ? <span className="font-normal text-telgrarr-muted"> ({entry.year})</span>
                : null}
            </h2>
            {entry.type && <SourceBadge type={entry.type} className="mt-0.5 shrink-0" />}
          </div>

          {/* Runtime · Genres — \u00B7 is the middle dot separator (JS escape) */}
          {(runtimeDisplay || entry.genres) && (
            <p className="text-sm text-telgrarr-muted mt-1">
              {[runtimeDisplay, entry.genres].filter(Boolean).join(' \u00B7 ')}
            </p>
          )}

          {/* Rating badges */}
          {hasRatings && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 justify-center md:justify-start">
              {ratings.imdb           && <RatingBadge source="imdb"       score={ratings.imdb} />}
              {ratings.rottenTomatoes && <RatingBadge source="rt"         score={ratings.rottenTomatoes} />}
              {ratings.tmdb           && <RatingBadge source="tmdb"       score={ratings.tmdb} />}
              {ratings.metacritic     && <RatingBadge source="metacritic" score={ratings.metacritic} />}
            </div>
          )}

          {/* Sent time + quality */}
          {(sentRelative || entry.quality) && (
            <p className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 text-xs text-telgrarr-muted mt-2">
              {sentRelative && (
                <span title={sentFull || undefined}>Sent {sentRelative}</span>
              )}
              {sentRelative && entry.quality && (
                <span aria-hidden="true" className="opacity-40">{'\u00B7'}</span>
              )}
              {entry.quality && <span>{entry.quality}</span>}
            </p>
          )}
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="mx-5 md:mx-6 mt-5 border-t border-telgrarr-border" role="separator" />

      {/* ── Overview ────────────────────────────────────────────────────────── */}
      {entry.overview && (
        <div className="px-5 md:px-6 pt-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-telgrarr-muted mb-2">
            Overview
          </h3>
          <p className="text-sm text-telgrarr-text leading-relaxed">{entry.overview}</p>
        </div>
      )}

      {/* ── Episodes / Content (type='show') ─────────────────────────────────── */}
      {entry.type === 'show' && (hasEpisodes || entry.details) && (
        <div className="px-5 md:px-6 pt-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-telgrarr-muted mb-2">
            {hasEpisodes ? 'Episodes' : 'Content'}
          </h3>
          {hasEpisodes ? (
            <ul className="space-y-1.5">
              {entry.episodes.map((ep, idx) => (
                <li key={idx} className="flex items-baseline gap-2 text-sm text-telgrarr-text">
                  {/* \u2014 = em dash; straight quotes per roadmap example */}
                  <span className="font-mono text-xs text-telgrarr-muted shrink-0 tabular-nums">
                    S{String(ep.season  ?? 0).padStart(2, '0')}E{String(ep.episode ?? 0).padStart(2, '0')}
                  </span>
                  {ep.title && (
                    <span>{'\u2014 "'}{ep.title}{'"'}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            /* Old entry fallback: entry.details holds "2 Episodes" etc. */
            <p className="text-sm text-telgrarr-text">{entry.details}</p>
          )}
        </div>
      )}

      {/* ── External links ───────────────────────────────────────────────────── */}
      {/* Buttons use telgrarr tokens only — brand hex is scoped to RatingBadge  */}
      {/* per AD [HIST HD-6]; navigation links don't share that justification.   */}
      {(tmdbUrl || imdbUrl) && (
        <div className="px-5 md:px-6 pt-5 flex flex-wrap gap-2">
          {tmdbUrl && (
            <a
              href={tmdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-telgrarr-border px-3 py-1.5 text-xs font-medium text-telgrarr-muted hover:text-telgrarr-text hover:border-telgrarr-purple transition-colors"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              TMDb
            </a>
          )}
          {imdbUrl && (
            <a
              href={imdbUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-telgrarr-border px-3 py-1.5 text-xs font-medium text-telgrarr-muted hover:text-telgrarr-text hover:border-telgrarr-purple transition-colors"
            >
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
              IMDb
            </a>
          )}
        </div>
      )}

      {/* Safe bottom padding (extra on mobile for gesture-bar clearance) */}
      <div className="pb-6 md:pb-5" />
    </>
  );
}

// ── ContentDetailModal (default export) ──────────────────────────────────────
export default function ContentDetailModal() {
  const detailEntry = useHistoryStore((s) => s.detailEntry);
  const closeDetail = useHistoryStore((s) => s.closeDetail);
  const prefersReduced = useReducedMotion();

  // Retain the last non-null entry so ModalContent renders correctly while
  // AnimatePresence plays the exit/dismiss animation after detailEntry is
  // set to null by closeDetail(). Only updated when detailEntry is non-null.
  const lastEntryRef = useRef(null);
  if (detailEntry !== null) lastEntryRef.current = detailEntry;
  const entry = lastEntryRef.current;

  const panelRef  = useRef(null);
  const closeRef  = useRef(null);
  const prevFocus = useRef(null);
  const idRef     = useRef(`cdm-${++idSeq}`);
  const titleId   = `${idRef.current}-title`;
  const isOpen    = detailEntry !== null;

  // ── Focus management — pattern: ConfirmModal ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    prevFocus.current = document.activeElement;
    const t = setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      const el = prevFocus.current;
      if (el && typeof el.focus === 'function') el.focus();
    };
  }, [isOpen]);

  // ── Focus trap: Tab cycle + Escape ───────────────────────────────────────
  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeDetail(); return; }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes?.length) return;
      const list = Array.from(nodes).filter((n) => !n.disabled);
      if (!list.length) return;
      const first = list[0];
      const last  = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    },
    [closeDetail],
  );

  // ── Animation ─────────────────────────────────────────────────────────────
  // isMobile sampled per-render; stable within a single open→close cycle
  // (no resize listener needed — the animation is chosen at open time).
  const isMobile = typeof window !== 'undefined'
    ? !window.matchMedia('(min-width: 768px)').matches
    : false;

  // useReducedMotion() override takes precedence over mobile/desktop split.
  const panelVariants = prefersReduced
    ? { initial: { opacity: 0 },           animate: { opacity: 1 },           exit: { opacity: 0 } }
    : isMobile
      ? { initial: { opacity: 0, y: '100%' }, animate: { opacity: 1, y: 0 },   exit: { opacity: 0, y: '100%' } }
      : { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 } };

  const panelTransition = prefersReduced
    ? { duration: 0.15 }
    : isMobile
      ? { type: 'spring', damping: 28, stiffness: 280 }
      : { type: 'spring', damping: 25, stiffness: 300 };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cdm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[50] flex items-end md:items-center justify-center bg-telgrarr-black/70 backdrop-blur-xs"
          onClick={closeDetail}
          onKeyDown={onKeyDown}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={panelTransition}
            className="w-full md:max-w-3xl bg-telgrarr-surface border border-telgrarr-border rounded-t-2xl md:rounded-2xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {entry && (
              <ModalContent
                entry={entry}
                titleId={titleId}
                closeRef={closeRef}
                onClose={closeDetail}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, useDragControls } from 'motion/react';
import { Languages, Trash2, X, ExternalLink } from 'lucide-react';
import useHistoryStore from '../store/historyStore';
import { useLocation } from 'react-router-dom';
import ConfirmModal from './ConfirmModal';
import PosterImage from './PosterImage';
import RatingBadge from './RatingBadge';
import SourceBadge from './SourceBadge';
import { formatRelativeTime, formatFullTime } from '../utils/timeFormat';

// Unique ID counter for ARIA labelling — same pattern as ConfirmModal.
let idSeq = 0;
// Episodes shown before the "Show all" expander (HIST-UPG HF2).
const EPISODES_CLAMP = 8;

// ── ModalContent ─────────────────────────────────────────────────────────────
// Kept separate from ContentDetailModal so the outer shell can hold the
// lastEntryRef snapshot while AnimatePresence plays the dismiss animation
// after detailEntry is cleared to null.
function ModalContent({ entry, titleId, closeRef, onClose, onRequestDelete, onHeaderPointerDown }) {
  const ratings    = entry.ratings || {};
  const hasRatings = !!(
    ratings.imdb || ratings.tmdb || ratings.rottenTomatoes || ratings.metacritic
  );
  const hasBackdrop = Boolean(entry.backdropUrl);
  // Backdrop lifecycle (HIST-UPG P4): fade in on load; a failed URL falls back
  // to the gradient base instead of rendering a broken/empty header.
  const [bdLoaded, setBdLoaded] = useState(false);
  const [bdFailed, setBdFailed] = useState(false);
  // Episodes clamp (HIST-UPG HF2): season packs can carry long lists; clamp
  // with an explicit expander so the sheet cannot balloon unbounded.
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const showBackdrop = hasBackdrop && !bdFailed;
  // Overview hygiene (HIST-UPG P4): legacy records embed a literal Telegram-HTML
  // machine-translation watermark; strip it for display and surface a styled
  // pill instead. New records carry machineTranslated:true (P5, additive);
  // honor both signals.
  const rawOverview = typeof entry.overview === 'string' ? entry.overview : '';
  const mtMatch = /<blockquote>[\s\S]*?<\/blockquote>\s*$/.exec(rawOverview);
  const overviewText = (mtMatch ? rawOverview.slice(0, mtMatch.index) : rawOverview).trim();
  const machineTranslated = entry.machineTranslated === true || mtMatch !== null;
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
      {/* Sheet header — flex-shrink-0, never scrolls (HIST-UPG HF3) */}
      <div
        className="flex-shrink-0 relative flex items-center justify-end px-4 pt-3 pb-2 touch-none"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="md:hidden absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-telgrarr-muted/30 cursor-grab active:cursor-grabbing" aria-hidden="true" />
        <button
          ref={closeRef}
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close"
          className="focus-ring flex items-center justify-center w-8 h-8 rounded-full bg-telgrarr-elevated border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text transition-colors"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {/* Scrollable body (HIST-UPG HF3) */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
      {/* ── Backdrop / hero header ──────────────────────────────────────────── */}
      <div className="relative shrink-0 h-44 md:h-52 rounded-t-2xl overflow-hidden">
        {/* Gradient base: always rendered (pre-load state + no/failed-backdrop fallback; R15 tokens) */}
        <div className="absolute inset-0 bg-linear-to-br from-telgrarr-purple/25 via-telgrarr-elevated to-telgrarr-black" />
        {showBackdrop && (
          <>
            <img
              src={entry.backdropUrl}
              alt=""
              aria-hidden="true"
              onLoad={() => setBdLoaded(true)}
              onError={() => setBdFailed(true)}
              className={'absolute inset-0 w-full h-full object-cover transition-opacity duration-500 motion-reduce:transition-none ' + (bdLoaded ? 'opacity-100' : 'opacity-0')}
            />
            {/* Scrim: dark top keeps the close button readable; melts into the panel surface below */}
            <div className="absolute inset-0 bg-linear-to-b from-telgrarr-black/50 via-telgrarr-black/25 to-telgrarr-surface" />
          </>
        )}

        
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
      {overviewText && (
        <div className="px-5 md:px-6 pt-5">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-telgrarr-muted">
              Overview
            </h3>
            {machineTranslated && (
              <span className="inline-flex items-center gap-1 rounded-full border border-telgrarr-border bg-telgrarr-elevated px-2 py-0.5 text-[9px] font-medium text-telgrarr-muted">
                <Languages className="w-2.5 h-2.5" aria-hidden="true" />
                Machine translation
              </span>
            )}
          </div>
          <p dir="auto" className="text-sm text-telgrarr-text leading-relaxed">{overviewText}</p>
        </div>
      )}

      {/* ── Episodes / Content (type='show') ─────────────────────────────────── */}
      {entry.type === 'show' && (hasEpisodes || entry.details) && (
        <div className="px-5 md:px-6 pt-5">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-telgrarr-muted mb-2">
            {hasEpisodes ? 'Episodes' : 'Content'}
          </h3>
          {hasEpisodes ? (
            <>
            <ul className="space-y-1.5">
              {(showAllEpisodes ? entry.episodes : entry.episodes.slice(0, EPISODES_CLAMP)).map((ep, idx) => (
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
            {entry.episodes.length > EPISODES_CLAMP && (
              <button
                onClick={() => setShowAllEpisodes((v) => !v)}
                className="focus-ring mt-2.5 text-xs font-medium text-telgrarr-purple hover:underline rounded"
              >
                {showAllEpisodes ? 'Show less' : 'Show all ' + entry.episodes.length + ' episodes'}
              </button>
            )}
            </>
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

      {/* Per-entry delete (HIST-UPG P7) - ConfirmModal-gated, mirrors History trash styling */}
      <div className="px-5 md:px-6 pt-5">
        <button
          onClick={onRequestDelete}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-telgrarr-border px-3 py-1.5 text-xs font-medium text-telgrarr-muted hover:text-telgrarr-danger hover:border-telgrarr-danger/50 transition-colors"
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
          Delete from history
        </button>
      </div>

      {/* Safe bottom padding (extra on mobile for gesture-bar clearance) */}
      <div className="pb-6 md:pb-5" />
      </div>
    </>
  );
}

// ── ContentDetailModal (default export) ──────────────────────────────────────
export default function ContentDetailModal() {
  const detailEntry = useHistoryStore((s) => s.detailEntry);
  const closeDetail = useHistoryStore((s) => s.closeDetail);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  // Drag-to-dismiss (HIST-UPG HF4): the mobile grab handle now performs a
  // real gesture instead of being decorative. dragListener=false means only
  // the header handle (dragControls.start) can begin a drag - the scrollable
  // body (HF3) is never draggable, so list scrolling is unaffected.
  const dragControls = useDragControls();
  const handleDragEnd = (_e, info) => {
    if (info.offset.y > 120 || info.velocity.y > 600) closeDetail();
  };  const titleId   = `${idRef.current}-title`;
  // Per-entry delete (HIST-UPG P7). On success close both modals; on failure
  // keep the confirm open so the user can retry or cancel (clear-all pattern).
  const handleDeleteConfirm = async () => {
    if (deleting || !entry?.id) return;
    setDeleting(true);
    try {
      await removeEntry(entry.id);
      setConfirmDeleteOpen(false);
      closeDetail();
    } catch (_) {
      /* confirm stays open */
    } finally {
      setDeleting(false);
    }
  };
  const isOpen    = detailEntry !== null;
  // Close on route change (HIST-UPG HF2): the modal renders once in AuthLayout
  // (global mount, not per-page); a nav tap must dismiss any open detail overlay.
  // closeDetail() is idempotent when nothing is open.
  const location = useLocation();
  useEffect(() => { closeDetail(); }, [location.pathname, closeDetail]);

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
    <>
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cdm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[55] flex items-end md:items-center justify-center bg-telgrarr-black/70 backdrop-blur-xs"
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
            drag={isMobile ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className="w-full md:max-w-3xl bg-telgrarr-surface border border-telgrarr-border rounded-t-2xl md:rounded-2xl max-h-[75vh] md:max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {entry && (
              <ModalContent
                entry={entry}
                titleId={titleId}
                closeRef={closeRef}
                onClose={closeDetail}
                onRequestDelete={() => setConfirmDeleteOpen(true)}
                onHeaderPointerDown={(e) => { if (isMobile) dragControls.start(e); }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
      {/* Sibling of the overlay (DEC-P7-1): its Tab/Escape must not bubble into the detail modal's trap */}
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        title="Delete Entry"
        message={'Remove "' + (entry?.title || 'this entry') + '" from history? This cannot be undone.'}
        confirmLabel={deleting ? 'Deleting\u2026' : 'Delete'}
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => !deleting && setConfirmDeleteOpen(false)}
      />
    </>
  );
}

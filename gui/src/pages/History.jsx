import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Clock, Search, X, Trash2, LayoutGrid, List, Table,
  ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal,
} from 'lucide-react';
import useHistoryStore    from '../store/historyStore';
import ConfirmModal       from '../components/ConfirmModal';
import ContentDetailModal from '../components/ContentDetailModal';
import PosterImage        from '../components/PosterImage';
import RatingBadge        from '../components/RatingBadge';
import SourceBadge        from '../components/SourceBadge';
import { formatRelativeTime, formatFullTime } from '../utils/timeFormat';

// ── SegCtrl ───────────────────────────────────────────────────────────────────
// No id/htmlFor — safe to render in both mobile panel and desktop bar
// simultaneously without duplicate-ID violations.
function SegCtrl({ options, value, onChange, label, className }) {
  return (
    <div role="group" aria-label={label}
      className={'flex rounded-xl bg-telgrarr-elevated border border-telgrarr-border/50 p-0.5 gap-0.5 ' + (className || '')}>
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={'focus-ring flex-1 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-all active:scale-95 ' +
            (value === opt.value
              ? 'bg-telgrarr-surface text-telgrarr-text shadow-xs border border-telgrarr-border/50'
              : 'text-telgrarr-muted hover:text-telgrarr-text')}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── PosterCard ────────────────────────────────────────────────────────────────
function PosterCard({ entry, onOpen, density, imgSize }) {
  const ariaLabel = [entry.title, entry.year != null && '(' + entry.year + ')']
    .filter(Boolean).join(' ') + ' \u2014 view details';
  return (
    <motion.div role="button" tabIndex={0} aria-label={ariaLabel}
      title={density === 'none' ? (entry.title || '') : undefined}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(entry))}
      className="focus-ring cursor-pointer rounded-xl border border-transparent hover:border-telgrarr-purple/40 hover:shadow-lg transition-all duration-200">
      <PosterImage url={entry.poster} size={imgSize} alt={entry.title || ''} />
      {density !== 'none' && (
        <div className="p-1.5 space-y-0.5">
          <p className="text-xs font-semibold text-telgrarr-text truncate leading-tight">{entry.title || ''}</p>
          {density === 'full' && (
            <>
              {entry.year != null && <p className="text-[10px] text-telgrarr-muted">{entry.year}</p>}
              {entry.type && <SourceBadge type={entry.type} />}
              {entry.timestamp && (
                <p className="text-[10px] text-telgrarr-muted mt-0.5">{formatRelativeTime(entry.timestamp)}</p>
              )}
            </>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── CompactCard ───────────────────────────────────────────────────────────────
function CompactCard({ entry, onOpen }) {
  const ariaLabel = [entry.title, entry.year != null && '(' + entry.year + ')']
    .filter(Boolean).join(' ') + ' \u2014 view details';
  return (
    <div role="button" tabIndex={0} aria-label={ariaLabel}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(entry))}
      className="focus-ring flex items-center gap-3 p-3 rounded-xl bg-telgrarr-surface/60 hover:bg-telgrarr-surface border border-transparent hover:border-telgrarr-border cursor-pointer transition-all">
      <div className="w-12 shrink-0"><PosterImage url={entry.poster} size="xs" alt="" /></div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-telgrarr-text truncate">{entry.title || ''}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          {entry.year != null && <span className="text-xs text-telgrarr-muted">{entry.year}</span>}
          {entry.type && <SourceBadge type={entry.type} />}
          {entry.quality && (
            <span className="text-[10px] text-telgrarr-muted truncate max-w-[120px]">{entry.quality}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {entry.ratings?.imdb && <RatingBadge source="imdb" score={entry.ratings.imdb} />}
          {entry.timestamp && (
            <span className="text-[10px] text-telgrarr-muted" title={formatFullTime(entry.timestamp)}>
              {formatRelativeTime(entry.timestamp)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── HistoryRow ────────────────────────────────────────────────────────────────
// focus-ring via ring utilities applies correctly on <tr> via box-shadow.
function HistoryRow({ entry, onOpen }) {
  const ariaLabel = [entry.title, entry.year != null && '(' + entry.year + ')']
    .filter(Boolean).join(' ') + ' \u2014 view details';
  return (
    <tr tabIndex={0} aria-label={ariaLabel}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(entry))}
      className="focus-ring cursor-pointer hover:bg-telgrarr-surface/60 border-b border-telgrarr-border/30 transition-colors">
      <td className="py-2 pl-4 pr-3 w-10"><div className="w-8"><PosterImage url={entry.poster} size="xs" alt="" /></div></td>
      <td className="py-2 pr-3 max-w-[200px]">
        <p className="text-sm font-semibold text-telgrarr-text truncate">{entry.title || ''}</p>
        {entry.year != null && <p className="text-[10px] text-telgrarr-muted">{entry.year}</p>}
      </td>
      <td className="py-2 pr-3">{entry.type && <SourceBadge type={entry.type} />}</td>
      <td className="py-2 pr-3">
        <span className="text-xs text-telgrarr-muted truncate block max-w-[140px]">{entry.quality || '\u2014'}</span>
      </td>
      <td className="py-2 pr-3">
        {entry.ratings?.imdb
          ? <RatingBadge source="imdb" score={entry.ratings.imdb} />
          : <span className="text-xs text-telgrarr-muted">{'\u2014'}</span>}
      </td>
      <td className="py-2 pr-4">
        <span className="text-xs text-telgrarr-muted whitespace-nowrap" title={formatFullTime(entry.timestamp)}>
          {formatRelativeTime(entry.timestamp)}
        </span>
      </td>
    </tr>
  );
}

// ── History page ──────────────────────────────────────────────────────────────
export default function History() {
  // Server state
  const items       = useHistoryStore((s) => s.items);
  const total       = useHistoryStore((s) => s.total);
  const page        = useHistoryStore((s) => s.page);
  const pageSize    = useHistoryStore((s) => s.pageSize);
  const stats       = useHistoryStore((s) => s.stats);
  const loading     = useHistoryStore((s) => s.loading);
  const error       = useHistoryStore((s) => s.error);
  // View prefs
  const viewMode    = useHistoryStore((s) => s.viewMode);
  const posterSize  = useHistoryStore((s) => s.posterSize);
  const infoDensity = useHistoryStore((s) => s.infoDensity);
  const sort        = useHistoryStore((s) => s.sort);
  const typeFilter  = useHistoryStore((s) => s.typeFilter);
  const searchQuery = useHistoryStore((s) => s.searchQuery);
  // Actions
  const fetchHistory   = useHistoryStore((s) => s.fetchHistory);
  const fetchStats     = useHistoryStore((s) => s.fetchStats);
  const setPage        = useHistoryStore((s) => s.setPage);
  const setViewMode    = useHistoryStore((s) => s.setViewMode);
  const setPosterSize  = useHistoryStore((s) => s.setPosterSize);
  const setInfoDensity = useHistoryStore((s) => s.setInfoDensity);
  const setSort        = useHistoryStore((s) => s.setSort);
  const setTypeFilter  = useHistoryStore((s) => s.setTypeFilter);
  const setSearchQuery = useHistoryStore((s) => s.setSearchQuery);
  const openDetail     = useHistoryStore((s) => s.openDetail);
  const clearHistory   = useHistoryStore((s) => s.clearHistory);

  const reduceMotion = useReducedMotion();

  // Local UI state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing,         setClearing]         = useState(false);
  const [filtersOpen,      setFiltersOpen]       = useState(false);
  // Decoupled search input: committed to store after 300 ms debounce.
  // Initialised from store so restored pref shows on mount.
  const [searchInput,  setSearchInput]  = useState(searchQuery);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const debounceRef = useRef(null);
  const pageRef     = useRef(null);

  // Mobile breakpoint — drives table→compact auto-switch per roadmap H5.1.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? !window.matchMedia('(min-width: 768px)').matches : false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const h  = (e) => setIsMobile(!e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const effectiveViewMode = viewMode === 'table' && isMobile ? 'compact' : viewMode;

  // Data fetching — fetchHistory reads all filter/page state from store via
  // get() at call time; listing deps keeps the effect reactive to changes.
  useEffect(() => { fetchHistory(); }, [fetchHistory, sort, typeFilter, searchQuery, page]);
  // Stats: mount-only; non-critical, failure already swallowed in store.
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Skeleton minimum 200 ms display — prevents flash on fast responses.
  useEffect(() => {
    if (loading) { setShowSkeleton(true); return; }
    const t = setTimeout(() => setShowSkeleton(false), 200);
    return () => clearTimeout(t);
  }, [loading]);

  // Scroll to top on page change. AuthLayout's root is overflow:hidden so
  // window.scrollTo is a no-op; walk the DOM for the scrollable ancestor.
  useEffect(() => {
    if (!pageRef.current) return;
    let el = pageRef.current.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        break;
      }
      el = el.parentElement;
    }
  }, [page, reduceMotion]);

  // Debounce cleanup on unmount.
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSearchChange = (e) => {
    const v = e.target.value;
    setSearchInput(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchQuery(v), 300);
  };
  const clearSearch = () => {
    clearTimeout(debounceRef.current);
    setSearchInput('');
    setSearchQuery('');
  };
  const clearAllFilters = () => { setTypeFilter('all'); setSort('newest'); clearSearch(); };

  const handleClear = async () => {
    if (clearing) return; // prevent double-tap
    setClearing(true);
    try {
      await clearHistory();
      setShowClearConfirm(false); // close only on success
    } catch (_) {
      // Modal stays open on failure — user can retry or cancel.
    } finally {
      setClearing(false);
    }
  };

  // Toggle sort direction for a table column (asc ↔ desc).
  const handleSortColumn = (asc, desc) => setSort(sort === asc ? desc : asc);

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeFilterCount = [
    typeFilter !== 'all',
    searchInput.trim().length > 0,
    sort !== 'newest',
  ].filter(Boolean).length;

  // Sort is excluded: it never reduces result count to zero.
  const filtersActive = typeFilter !== 'all' || searchQuery.trim().length > 0;
  const totalPages    = Math.max(1, Math.ceil(total / pageSize));
  // posterSize values ('sm','md','lg') are identical to PosterImage size prop values.
  const imgSize       = posterSize;
  const gridStyle =
    posterSize === 'lg' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' } :
    posterSize === 'sm' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' } :
                          { gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' };

  // ── Filter controls ────────────────────────────────────────────────────────
  // Function (not const) so each call creates an independent React element
  // tree — avoids key collisions when rendered in both desktop bar and mobile
  // panel simultaneously. aria-label / aria-pressed only, no id/htmlFor.
  const renderFilters = () => (
    <>
      <SegCtrl label="Filter by type" value={typeFilter} onChange={setTypeFilter}
        options={[
          { value: 'all',   label: 'All'    },
          { value: 'movie', label: 'Movies' },
          { value: 'show',  label: 'Shows'  },
        ]} />
      <div className="relative flex-1 min-w-[140px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" aria-hidden="true" />
        <input type="search" value={searchInput} onChange={handleSearchChange}
          placeholder={'Search titles\u2026'} aria-label="Search history"
          className="focus-ring w-full bg-telgrarr-elevated border border-telgrarr-border rounded-lg py-2 pl-8 pr-8 text-xs font-medium text-telgrarr-text placeholder:text-telgrarr-muted/60 focus:border-telgrarr-purple transition-colors" />
        {searchInput && (
          <button onClick={clearSearch} aria-label="Clear search"
            className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 text-telgrarr-muted hover:text-telgrarr-text transition-colors">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="relative shrink-0">
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort order"
          className="appearance-none bg-telgrarr-elevated border border-telgrarr-border rounded-lg py-2 pl-3 pr-8 text-xs font-medium text-telgrarr-text focus:outline-hidden focus:border-telgrarr-purple transition-colors">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title-asc">{'Title A \u2192 Z'}</option>
          <option value="title-desc">{'Title Z \u2192 A'}</option>
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-telgrarr-muted pointer-events-none" aria-hidden="true" />
      </div>
      {viewMode === 'poster' && (
        <SegCtrl label="Poster size" value={posterSize} onChange={setPosterSize}
          options={[{ value: 'sm', label: 'S' }, { value: 'md', label: 'M' }, { value: 'lg', label: 'L' }]} />
      )}
      {viewMode !== 'table' && (
        <SegCtrl label="Info density" value={infoDensity} onChange={setInfoDensity}
          options={[{ value: 'full', label: 'Full' }, { value: 'minimal', label: 'Min' }, { value: 'none', label: 'None' }]} />
      )}
    </>
  );

  // ── Skeleton ───────────────────────────────────────────────────────────────
  const skeleton = effectiveViewMode === 'poster' ? (
    <div className="px-4 py-4">
      <div className="grid gap-3" style={gridStyle}>
        {[...Array(12)].map((_, i) => (
          <div key={i} className="aspect-[2/3] rounded-xl bg-telgrarr-surface animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  ) : (
    <div className="px-4 py-4 space-y-2">
      {[...Array(8)].map((_, i) => (
        <div key={i}
          className={'rounded-xl bg-telgrarr-surface animate-pulse motion-reduce:animate-none ' +
            (effectiveViewMode === 'compact' ? 'h-16' : 'h-12')} />
      ))}
    </div>
  );

  // ── Body (IIFE — clean conditional branches, no nested ternary chains) ─────
  const body = (() => {
    if (showSkeleton && items.length === 0) return skeleton;

    if (error) return (
      <div className="px-4 py-16 flex flex-col items-center text-center gap-3" role="alert">
        <p className="text-sm text-telgrarr-danger">{error}</p>
        <button onClick={() => fetchHistory()}
          className="focus-ring px-4 py-2 rounded-lg bg-telgrarr-elevated border border-telgrarr-border text-sm text-telgrarr-text hover:border-telgrarr-purple transition-colors">
          Retry
        </button>
      </div>
    );

    if (total === 0 && !filtersActive) return (
      <div className="px-4 py-20 flex flex-col items-center text-center gap-3">
        <Clock className="w-10 h-10 text-telgrarr-muted opacity-40" aria-hidden="true" />
        <p className="text-sm font-semibold text-telgrarr-text">No notification history yet</p>
        <p className="text-xs text-telgrarr-muted max-w-[240px] leading-relaxed">
          Items appear here after Telgrarr sends notifications.
        </p>
      </div>
    );

    if (items.length === 0 && filtersActive) return (
      <div className="px-4 py-20 flex flex-col items-center text-center gap-3">
        <SlidersHorizontal className="w-10 h-10 text-telgrarr-muted opacity-40" aria-hidden="true" />
        <p className="text-sm font-semibold text-telgrarr-text">No results matching your filters</p>
        <button onClick={clearAllFilters}
          className="focus-ring px-4 py-2 rounded-lg bg-telgrarr-elevated border border-telgrarr-border text-xs font-medium text-telgrarr-muted hover:text-telgrarr-text hover:border-telgrarr-purple transition-colors">
          Clear filters
        </button>
      </div>
    );

    const listContent = (() => {
      if (effectiveViewMode === 'poster') return (
        <div className="grid gap-3" style={gridStyle}>
          {items.map((entry) => (
            <PosterCard key={entry.id} entry={entry} onOpen={openDetail} density={infoDensity} imgSize={imgSize} />
          ))}
        </div>
      );

      if (effectiveViewMode === 'compact') return (
        <div className="space-y-2">
          {items.map((entry) => <CompactCard key={entry.id} entry={entry} onOpen={openDetail} />)}
        </div>
      );

      // Table — effectiveViewMode guards that this only runs on desktop.
      return (
        <div className="overflow-x-auto rounded-xl bg-telgrarr-surface/60 border border-telgrarr-border/50">
          <table className="w-full">
            <thead>
              <tr className="border-b border-telgrarr-border/50">
                <th className="w-10 py-2 pl-4 pr-3" />
                <th onClick={() => handleSortColumn('title-asc', 'title-desc')}
                  aria-sort={sort === 'title-asc' ? 'ascending' : sort === 'title-desc' ? 'descending' : 'none'}
                  className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-telgrarr-muted cursor-pointer select-none hover:text-telgrarr-text transition-colors">
                  Title
                  {sort === 'title-asc'  && <span aria-hidden="true">{' \u2191'}</span>}
                  {sort === 'title-desc' && <span aria-hidden="true">{' \u2193'}</span>}
                </th>
                <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-telgrarr-muted">Type</th>
                <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-telgrarr-muted">Quality</th>
                <th className="py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-telgrarr-muted">IMDb</th>
                <th onClick={() => handleSortColumn('newest', 'oldest')}
                  aria-sort={sort === 'newest' ? 'descending' : sort === 'oldest' ? 'ascending' : 'none'}
                  className="py-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-telgrarr-muted cursor-pointer select-none hover:text-telgrarr-text transition-colors">
                  Sent
                  {sort === 'newest' && <span aria-hidden="true">{' \u2193'}</span>}
                  {sort === 'oldest' && <span aria-hidden="true">{' \u2191'}</span>}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => <HistoryRow key={entry.id} entry={entry} onOpen={openDetail} />)}
            </tbody>
          </table>
        </div>
      );
    })();

    return (
      <div className={'px-4 py-4 space-y-4 transition-opacity duration-200 ' + (loading ? 'opacity-60' : 'opacity-100')}>
        {listContent}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              aria-label="Previous page"
              className="focus-ring p-1.5 rounded-lg border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text hover:border-telgrarr-purple disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-xs text-telgrarr-muted tabular-nums">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              aria-label="Next page"
              className="focus-ring p-1.5 rounded-lg border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-text hover:border-telgrarr-purple disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    );
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={pageRef} className="text-telgrarr-text">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-telgrarr-surface/90 backdrop-blur-xl border-b border-telgrarr-border shadow-card">

        {/* Title row */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-telgrarr-border/50">
          <div className="flex items-start gap-2.5">
            <Clock className="w-5 h-5 text-telgrarr-purple mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold text-telgrarr-text tracking-wide">History</h1>
              {stats && (
                <p className="text-[10px] text-telgrarr-muted leading-tight">
                  {stats.total + ' notification' + (stats.total !== 1 ? 's' : '') +
                   (stats.byType?.movie > 0 ? ' \u00B7 ' + stats.byType.movie + ' movie' + (stats.byType.movie !== 1 ? 's' : '') : '') +
                   (stats.byType?.show  > 0 ? ' \u00B7 ' + stats.byType.show  + ' show'  + (stats.byType.show  !== 1 ? 's' : '') : '')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div role="group" aria-label="View mode"
              className="flex rounded-xl bg-telgrarr-elevated border border-telgrarr-border/50 p-0.5 gap-0.5">
              {[
                { mode: 'poster',  Icon: LayoutGrid, label: 'Poster grid'  },
                { mode: 'compact', Icon: List,        label: 'Compact list' },
                { mode: 'table',   Icon: Table,       label: 'Table view'   },
              ].filter(({ mode }) => !(mode === 'table' && isMobile)).map(({ mode, Icon, label }) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  aria-pressed={effectiveViewMode === mode} aria-label={label}
                  className={'focus-ring p-1.5 rounded-lg transition-all active:scale-95 ' +
                    (effectiveViewMode === mode
                      ? 'bg-telgrarr-surface text-telgrarr-text shadow-xs border border-telgrarr-border/50'
                      : 'text-telgrarr-muted hover:text-telgrarr-text')}>
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              ))}
            </div>
            {/* Clear history — only shown when entries exist */}
            {total > 0 && (
              <button onClick={() => setShowClearConfirm(true)} aria-label="Clear history"
                className="focus-ring p-1.5 rounded-lg border border-telgrarr-border text-telgrarr-muted hover:text-telgrarr-danger hover:border-telgrarr-danger/50 transition-colors">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop filter bar — hidden on mobile */}
        <div className="hidden md:flex items-center gap-2 px-4 py-2.5 flex-wrap">
          {renderFilters()}
        </div>

        {/* Mobile filter toggle + animated collapse panel */}
        <div className="md:hidden">
          <button onClick={() => setFiltersOpen((p) => !p)} aria-expanded={filtersOpen}
            className="focus-ring flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-telgrarr-muted hover:text-telgrarr-text transition-colors">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-telgrarr-purple text-white text-[9px] font-bold leading-none">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <ChevronDown
              className={'w-3.5 h-3.5 transition-transform duration-200 ' + (filtersOpen ? 'rotate-180' : '')}
              aria-hidden="true" />
          </button>
          <AnimatePresence>
            {filtersOpen && (
              <motion.div key="mobile-filters"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                exit={reduceMotion  ? { opacity: 0 } : { opacity: 0, height: 0 }}
                transition={reduceMotion ? { duration: 0.15 } : { duration: 0.2 }}
                className="overflow-hidden">
                <div className="flex flex-col gap-2 px-4 pb-3">{renderFilters()}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* Content */}
      {body}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={showClearConfirm}
        title="Clear History"
        message={'This will permanently delete all ' + total + ' history entr' + (total === 1 ? 'y' : 'ies') + '. This cannot be undone.'}
        confirmLabel={clearing ? 'Clearing\u2026' : 'Clear History'}
        danger
        onConfirm={handleClear}
        onCancel={() => !clearing && setShowClearConfirm(false)}
      />
      <ContentDetailModal />
    </div>
  );
}

import { create } from 'zustand';
import api from '../api';

// View-preference persistence key (manual localStorage — project pattern per
// authStore/themeStore; no Zustand persist middleware in use).
const PREFS_KEY = 'telgrarr-history-prefs';

const VALID_VIEW_MODES   = ['poster', 'compact', 'table'];
const VALID_POSTER_SIZES = ['sm', 'md', 'lg'];
const VALID_DENSITIES    = ['full', 'minimal', 'none'];
const VALID_SORTS        = ['newest', 'oldest', 'title-asc', 'title-desc'];
const VALID_TYPE_FILTERS = ['all', 'show', 'movie'];

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function savePrefs(update) {
  try {
    const current = loadPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...update }));
  } catch (_) {}
}

// Validators — fall back to defaults on any invalid stored value.
const safeViewMode   = (v) => VALID_VIEW_MODES.includes(v)   ? v : 'poster';
const safePosterSize = (v) => VALID_POSTER_SIZES.includes(v) ? v : 'md';
const safeDensity    = (v) => VALID_DENSITIES.includes(v)    ? v : 'full';
const safeSort       = (v) => VALID_SORTS.includes(v)        ? v : 'newest';
const safeTypeFilter = (v) => VALID_TYPE_FILTERS.includes(v) ? v : 'all';
const safeSearch     = (v) => typeof v === 'string'          ? v : '';

// Read persisted prefs once at module load (same pattern as authStore/themeStore).
const _p = loadPrefs();

const useHistoryStore = create((set, get) => ({
  // ── Server state (ephemeral — never persisted) ────────────────────────────
  items:       [],
  total:       0,
  page:        1,
  pageSize:    24,
  stats:       null,
  loading:     false,
  error:       null,
  detailEntry: null,

  // ── View preferences (persisted to localStorage) ──────────────────────────
  viewMode:    safeViewMode(_p.viewMode),
  posterSize:  safePosterSize(_p.posterSize),
  infoDensity: safeDensity(_p.infoDensity),
  sort:        safeSort(_p.sort),
  typeFilter:  safeTypeFilter(_p.typeFilter),
  searchQuery: safeSearch(_p.searchQuery),

  // ── Server actions ────────────────────────────────────────────────────────

  fetchHistory: async () => {
    const { sort, typeFilter, searchQuery, page, pageSize } = get();
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      params.set('sort',     sort);
      params.set('page',     String(page));
      params.set('pageSize', String(pageSize));
      if (typeFilter !== 'all')        params.set('type',   typeFilter);
      if (searchQuery.trim().length)   params.set('search', searchQuery.trim());
      const res = await api.get('/history?' + params.toString());
      set({
        items:    res.data.items,
        total:    res.data.total,
        page:     res.data.page,
        pageSize: res.data.pageSize,
        loading:  false,
      });
    } catch (err) {
      set({
        loading: false,
        error:   err?.response?.data?.error || 'Failed to load history.',
      });
    }
  },

  fetchStats: async () => {
    try {
      const res = await api.get('/history/stats');
      set({ stats: res.data });
    } catch (_) {
      // Stats are non-critical display info; suppress error silently.
    }
  },

  setPage: (page) => set({ page }),

  openDetail:  (entry) => set({ detailEntry: entry }),
  closeDetail: ()      => set({ detailEntry: null }),

  removeEntry: async (id) => {
    await api.delete('/history/' + id);
    await get().fetchHistory();
    await get().fetchStats();
  },

  clearHistory: async () => {
    // Axios DELETE body requires the `data` key (not second positional arg).
    await api.delete('/history', { data: { confirm: 'CLEAR_HISTORY' } });
    set({ items: [], total: 0, page: 1, stats: null });
    await get().fetchStats();
  },

  // ── Preference actions (each persists only its own key) ───────────────────

  setViewMode: (v) => {
    const val = safeViewMode(v);
    savePrefs({ viewMode: val });
    set({ viewMode: val });
  },

  setPosterSize: (v) => {
    const val = safePosterSize(v);
    savePrefs({ posterSize: val });
    set({ posterSize: val });
  },

  setInfoDensity: (v) => {
    const val = safeDensity(v);
    savePrefs({ infoDensity: val });
    set({ infoDensity: val });
  },

  // Sort/type/search reset page to 1 — new filter context = start from page 1.
  setSort: (v) => {
    const val = safeSort(v);
    savePrefs({ sort: val });
    set({ sort: val, page: 1 });
  },

  setTypeFilter: (v) => {
    const val = safeTypeFilter(v);
    savePrefs({ typeFilter: val });
    set({ typeFilter: val, page: 1 });
  },

  setSearchQuery: (v) => {
    const val = safeSearch(v);
    savePrefs({ searchQuery: val });
    set({ searchQuery: val, page: 1 });
  },
}));

export default useHistoryStore;

import { create } from 'zustand';
import api from '../api';

// Blacklisted-titles list (reverse-enriched via GET /api/blacklist/titles).
// Scope: powers the "Blacklisted" view only. Race-guarding against rapid
// type-switching (sonarr <-> radarr) is a component-lifecycle concern —
// handled by the caller's own `cancelled`-closure guard, same convention
// already used for the Titles search fetch in Blacklist.jsx. No fetch-
// sequence counter here (that pattern belongs to historyStore's higher-
// frequency debounced-search/sort/pagination case, not this one — YAGNI).
// Monotonic sequence guard for searchTitles only (debounced-search race
// class — same pattern as historyStore's _fetchSeq). NOT used by
// fetchTitles/fetchFolders: fetchTitles has no such guard per Step 2's
// declared rationale (discrete trigger, no debounce), and fetchFolders
// matches the pre-migration inline effect, which carried none either.
let _searchSeq = 0;

const useBlacklistStore = create((set) => ({
  titles:  [],
  loading: false,
  error:   null,

  results:        [],
  searchLoading:  false,
  searchError:    null,

  folders:        [],
  foldersLoading: false,
  foldersError:   null,

  fetchTitles: async (type) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get('/blacklist/titles', { params: { type } });
      set({ titles: res.data, loading: false });
    } catch (err) {
      set({ loading: false, error: err.response?.data?.error || err.message });
    }
  },

  removeTitle: async (type, id) => {
    try {
      await api.post('/blacklist/ids/remove', { type, id });
      set((s) => ({ titles: s.titles.filter((t) => t.id !== id) }));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || err.message };
    }
  },

  // Debounced search (Titles tab). Sequence-guarded — see the module-level
  // comment on _searchSeq. The empty-query short-circuit still bumps the
  // sequence: this is required, not incidental — it invalidates any
  // still-in-flight request the same way the original effect's cleanup did.
  searchTitles: async (type, q) => {
    const seq = ++_searchSeq;
    const trimmed = q.trim();
    if (!trimmed) { set({ results: [] }); return; }
    set({ searchLoading: true, searchError: null });
    try {
      const res = await api.get('/blacklist/search', { params: { type, q: trimmed } });
      if (seq !== _searchSeq) return; // stale — superseded by a newer search
      set({ results: res.data, searchLoading: false });
    } catch (err) {
      if (seq !== _searchSeq) return;
      set({ searchLoading: false, searchError: err.response?.data?.error || 'Search failed' });
    }
  },

  // Add/remove a search-result id (Titles tab). Optimistic in-place update —
  // identical end-state to the inline executeToggle's setResults(prev => ...).
  toggleSearchResult: async (type, item) => {
    const action = item.blacklisted ? 'remove' : 'add';
    try {
      await api.post(`/blacklist/ids/${action}`, { type, id: item.id });
      set((s) => ({
        results: s.results.map((r) => (r.id === item.id ? { ...r, blacklisted: action === 'add' } : r)),
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Action failed' };
    }
  },

  // Folders tab list. Deliberately carries NO race guard — matches the
  // pre-migration inline effect's actual behavior exactly (see module note).
  fetchFolders: async (type) => {
    set({ foldersLoading: true, foldersError: null });
    try {
      const res = await api.get('/blacklist/rootfolders', { params: { type } });
      set({ folders: res.data, foldersLoading: false });
    } catch (err) {
      set({ foldersLoading: false, foldersError: err.response?.data?.error || 'Failed to load folders' });
    }
  },

  // Add/remove a blacklisted path (Folders tab). Named toggleFolderPath
  // (not togglePath) to avoid colliding with the component's existing
  // local togglePath callback, which opens the confirm modal — a distinct
  // job from this store action, which performs the actual mutation.
  toggleFolderPath: async (type, folder) => {
    const action = folder.blacklisted ? 'remove' : 'add';
    try {
      await api.post(`/blacklist/paths/${action}`, { type, path: folder.path });
      set((s) => ({
        folders: s.folders.map((f) => (f.path === folder.path ? { ...f, blacklisted: action === 'add' } : f)),
      }));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Action failed' };
    }
  },
}));


export default useBlacklistStore;

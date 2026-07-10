import { create } from 'zustand';
import api from '../api';

// Blacklisted-titles list (reverse-enriched via GET /api/blacklist/titles).
// Scope: powers the "Blacklisted" view only. Race-guarding against rapid
// type-switching (sonarr <-> radarr) is a component-lifecycle concern —
// handled by the caller's own `cancelled`-closure guard, same convention
// already used for the Titles search fetch in Blacklist.jsx. No fetch-
// sequence counter here (that pattern belongs to historyStore's higher-
// frequency debounced-search/sort/pagination case, not this one — YAGNI).
const useBlacklistStore = create((set) => ({
  titles:  [],
  loading: false,
  error:   null,

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
}));

export default useBlacklistStore;
